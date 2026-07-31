#!/usr/bin/env python3
"""
Migrate Supabase backup data into self-hosted PostgreSQL.
Run from the backend container:
  docker exec jobforgex-backend-1 python /app/scripts/migrate_supabase.py

Requires: backup zip at /app/jobforgex_260730.backup.zip
The backup must be mounted/copied to the backend container first.
"""

import os
import subprocess
import sys
import json
from urllib.parse import quote_plus

import psycopg2

DB_HOST = os.getenv("DB_HOST", "postgres")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_USER = os.getenv("DB_USER", "jobforgex")
DB_PASSWORD = os.getenv("DB_PASSWORD", "jobforgex")
DB_NAME = os.getenv("DB_NAME", "jobforgex")

SRC_DB = "jobforgex_restore"
BACKUP_ZIP = os.getenv("BACKUP_ZIP", "/app/jobforgex_260730.backup.zip")


def run_psql(db, sql, ignore_errors=False):
    """Run SQL via psql in the postgres container."""
    cmd = [
        "psql", "-U", DB_USER, "-d", db,
        "-h", DB_HOST, "-p", DB_PORT,
        "-c", sql
    ]
    env = {**os.environ, "PGPASSWORD": DB_PASSWORD}
    r = subprocess.run(cmd, capture_output=True, text=True, env=env)
    if r.returncode != 0 and not ignore_errors:
        print(f"psql error ({db}): {r.stderr}")
    return r.stdout


def step1_create_temp_db(conn):
    """Drop and recreate temp database."""
    cur = conn.cursor()
    conn.autocommit = True
    cur.execute(f"DROP DATABASE IF EXISTS {SRC_DB}")
    cur.execute(f"CREATE DATABASE {SRC_DB}")
    cur.close()
    print("[1/6] Temp database created")


def step2_restore_backup():
    """Extract zip and restore to temp DB."""
    import zipfile
    import tempfile

    if not os.path.exists(BACKUP_ZIP):
        print(f"ERROR: Backup zip not found at {BACKUP_ZIP}")
        sys.exit(1)

    tmpdir = tempfile.mkdtemp()
    with zipfile.ZipFile(BACKUP_ZIP) as zf:
        zf.extractall(tmpdir)
        backup_file = os.path.join(tmpdir, zf.namelist()[0])

    # Restore auth + public schemas only, ignore errors
    env = {**os.environ, "PGPASSWORD": DB_PASSWORD}
    subprocess.run([
        "pg_restore", "-U", DB_USER, "-h", DB_HOST, "-p", DB_PORT,
        "-d", SRC_DB, "--no-acl", "--no-owner",
        "--schema=auth", "--schema=public",
        "-f", "/tmp/restore_data.sql", backup_file
    ], check=True, env=env)

    # Create necessary roles/schemas before applying
    run_psql(SRC_DB, "CREATE ROLE authenticated NOLOGIN", ignore_errors=True)
    run_psql(SRC_DB, "CREATE SCHEMA IF NOT EXISTS storage", ignore_errors=True)

    env_pw = {**os.environ, "PGPASSWORD": DB_PASSWORD}
    subprocess.run([
        "psql", "-U", DB_USER, "-h", DB_HOST, "-p", DB_PORT,
        "-d", SRC_DB, "-f", "/tmp/restore_data.sql"
    ], capture_output=True, text=True, env=env_pw)

    os.unlink("/tmp/restore_data.sql")
    import shutil
    shutil.rmtree(tmpdir)

    # Verify
    src = psycopg2.connect(host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASSWORD, dbname=SRC_DB)
    cur = src.cursor()
    cur.execute("SELECT count(*) FROM auth.users")
    n = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM public.workspaces")
    w = cur.fetchone()[0]
    src.close()
    print(f"[2/6] Backup restored: {n} users, {w} workspaces")


def step3_migrate_users():
    """Copy auth.users → public.users, preserving IDs. Map existing emails."""
    src = psycopg2.connect(host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASSWORD, dbname=SRC_DB)
    dst = psycopg2.connect(host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASSWORD, dbname=DB_NAME)

    sc = src.cursor()
    dc = dst.cursor()

    # Get existing emails in production
    dc.execute("SELECT id, email FROM public.users")
    existing = {row[1]: str(row[0]) for row in dc.fetchall()}

    # Get old auth.users
    sc.execute("""
        SELECT id, email, encrypted_password,
               raw_user_meta_data->>'full_name' AS full_name,
               email_confirmed_at, created_at, updated_at
        FROM auth.users
    """)

    user_map = {}  # old_uuid → new_uuid
    added = 0
    mapped = 0

    for row in sc.fetchall():
        old_id, email, pw, name, verified, created, updated = row
        old_id_str = str(old_id)
        name = name or email

        if email in existing:
            user_map[old_id_str] = existing[email]
            mapped += 1
        else:
            user_map[old_id_str] = old_id_str
            dc.execute(
                """INSERT INTO public.users (id, email, password_hash, full_name, email_verified, verified_at, created_at, updated_at)
                VALUES (%s, %s, %s, %s, TRUE, %s, %s, %s)
                ON CONFLICT (email) DO NOTHING""",
                (old_id, email, pw, name, verified, created, updated)
            )
            added += 1

    dst.commit()
    sc.close(); dc.close()
    src.close(); dst.close()

    print(f"[3/6] Users: {added} new, {mapped} mapped to existing")
    return user_map


def step4_migrate_data(user_map):
    """Copy all public schema tables with FK remapping."""
    src = psycopg2.connect(host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASSWORD, dbname=SRC_DB)
    dst = psycopg2.connect(host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASSWORD, dbname=DB_NAME)

    sc = src.cursor()
    dc = dst.cursor()

    # Delete existing seed data that might conflict
    dc.execute("DELETE FROM public.geo_pricing")
    dc.execute("DELETE FROM public.plans")
    dst.commit()

    # Tables in dependency order
    tables = [
        "plans",
        "geo_pricing",
        "workspaces",
        "boards",
        "jobs",
        "resumes",
        "resume_versions",
        "builder_resumes",
        "builder_resume_versions",
        "job_artifacts",
        "user_roles",
        "subscriptions",
        "extension_tokens",
        "prompt_logs",
        "download_logs",
        "ai_providers",
        "ai_models",
        "ai_cost_logs",
    ]

    user_fk_cols = {"user_id", "owner_user_id"}

    for table in tables:
        # Get column info from source
        sc.execute(f"""
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = %s
            ORDER BY ordinal_position
        """, (table,))
        cols = [r[0] for r in sc.fetchall()]
        if not cols:
            print(f"  SKIP {table} (not in source)")
            continue

        sc.execute(f"SELECT * FROM public.{table}")
        rows = sc.fetchall()
        if not rows:
            print(f"  OK   {table}: 0 rows")
            continue

        inserted = 0
        for row in rows:
            d = dict(zip(cols, row))

            # Remap user FK columns
            for col in user_fk_cols:
                if col in d and d[col] is not None:
                    old = str(d[col])
                    if old in user_map:
                        d[col] = user_map[old]
                    else:
                        d = None
                        break

            if d is None:
                continue

            # Convert Python dicts to JSON strings for jsonb
            for k, v in list(d.items()):
                if isinstance(v, dict):
                    d[k] = json.dumps(v)

            placeholders = ", ".join(f"%({c})s" for c in cols)
            col_list = ", ".join(cols)
            try:
                dc.execute(
                    f"INSERT INTO public.{table} ({col_list}) VALUES ({placeholders}) ON CONFLICT DO NOTHING",
                    d
                )
                inserted += dc.rowcount
            except Exception as e:
                print(f"  ERR  {table}: {e}")
                dst.rollback()
                sc.close(); dc.close()
                src.close(); dst.close()
                raise

        dst.commit()
        print(f"  OK   {table}: {inserted} rows")

    sc.close(); dc.close()
    src.close(); dst.close()
    print(f"[4/6] Data migrated")


def step5_verify():
    """Check row counts."""
    dst = psycopg2.connect(host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASSWORD, dbname=DB_NAME)
    cur = dst.cursor()
    tables = [
        "users", "workspaces", "boards", "jobs", "resumes", "resume_versions",
        "builder_resumes", "builder_resume_versions", "job_artifacts",
        "user_roles", "subscriptions", "extension_tokens", "prompt_logs",
        "ai_providers", "ai_models", "ai_cost_logs", "plans", "geo_pricing",
    ]
    for t in tables:
        cur.execute(f"SELECT count(*) FROM {t}")
        print(f"  {t}: {cur.fetchone()[0]}")
    cur.close()
    dst.close()
    print(f"[5/6] Verified")


def step6_cleanup():
    """Drop temp database."""
    conn = psycopg2.connect(host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASSWORD, dbname=DB_NAME)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute(f"DROP DATABASE IF EXISTS {SRC_DB}")
    cur.close()
    conn.close()
    print(f"[6/6] Temp DB cleaned up")


def main():
    conn = psycopg2.connect(host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASSWORD, dbname=DB_NAME)

    step1_create_temp_db(conn)
    conn.close()

    step2_restore_backup()
    user_map = step3_migrate_users()
    step4_migrate_data(user_map)
    step5_verify()
    step6_cleanup()

    print("\nMigration complete!")


if __name__ == "__main__":
    main()
