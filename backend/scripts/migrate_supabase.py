#!/usr/bin/env python3
"""
Migrate data from a Supabase dump (restored to jobforgex_restore) → production jobforgex.

Run AFTER restoring the backup to the temp database:
  docker exec jobforgex-postgres-1 pg_restore -U jobforgex -d jobforgex_restore --no-acl --no-owner --schema=auth --schema=public <backup_file>

Usage:
  docker cp <backup_file> jobforgex-postgres-1:/tmp/
  docker exec jobforgex-postgres-1 dropdb -U jobforgex --if-exists jobforgex_restore
  docker exec jobforgex-postgres-1 createdb -U jobforgex jobforgex_restore
  docker exec jobforgex-postgres-1 psql -U jobforgex -d jobforgex_restore -c "CREATE ROLE authenticated NOLOGIN"
  docker exec jobforgex-postgres-1 psql -U jobforgex -d jobforgex_restore -c "CREATE SCHEMA IF NOT EXISTS storage"
  docker exec jobforgex-postgres-1 pg_restore -U jobforgex -d jobforgex_restore --no-acl --no-owner --schema=auth --schema=public /tmp/<backup_file>
  docker exec jobforgex-backend-1 python /app/scripts/migrate_supabase.py
"""

import os
import sys
import json

import psycopg2

DB_HOST = os.getenv("DB_HOST", "postgres")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_USER = os.getenv("DB_USER", "jobforgex")
DB_PASSWORD = os.getenv("DB_PASSWORD", "jobforgex")
DB_NAME = os.getenv("DB_NAME", "jobforgex")
SRC_DB = "jobforgex_restore"


def connect(db):
    return psycopg2.connect(host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASSWORD, dbname=db)


def step1_check_temp_db():
    """Verify restore DB exists and has data."""
    try:
        src = connect(SRC_DB)
        cur = src.cursor()
        cur.execute("SELECT count(*) FROM auth.users")
        n_users = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM public.workspaces")
        n_ws = cur.fetchone()[0]
        cur.close()
        src.close()
        if n_users == 0:
            print(f"ERROR: {SRC_DB} has no auth.users — was the backup restored?")
            sys.exit(1)
        print(f"[1/4] Restore DB verified: {n_users} users, {n_ws} workspaces")
    except psycopg2.OperationalError:
        print(f"ERROR: Database '{SRC_DB}' does not exist. Restore the backup first.")
        sys.exit(1)


def step2_migrate_users():
    """Copy auth.users → public.users, preserving IDs. Map existing emails."""
    src = connect(SRC_DB)
    dst = connect(DB_NAME)

    sc = src.cursor()
    dc = dst.cursor()

    dc.execute("SELECT id, email FROM public.users")
    existing = {row[1]: str(row[0]) for row in dc.fetchall()}

    sc.execute("""
        SELECT id, email, encrypted_password,
               raw_user_meta_data->>'full_name' AS full_name,
               email_confirmed_at, created_at, updated_at
        FROM auth.users
    """)

    user_map = {}
    added = mapped = 0

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
            added += dc.rowcount

    dst.commit()
    sc.close(); dc.close()
    src.close(); dst.close()

    print(f"[2/4] Users: {added} new, {mapped} mapped to existing")
    return user_map


def step3_migrate_data(user_map):
    """Copy all public schema tables with FK remapping."""
    src = connect(SRC_DB)
    dst = connect(DB_NAME)

    sc = src.cursor()
    dc = dst.cursor()

    # Clear existing seed data that conflicts
    dc.execute("DELETE FROM public.geo_pricing")
    dc.execute("DELETE FROM public.plans")
    dst.commit()

    # Tables in FK dependency order
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


def step4_verify():
    """Show final row counts."""
    dst = connect(DB_NAME)
    cur = dst.cursor()
    tables = [
        "users", "workspaces", "boards", "jobs", "resumes", "resume_versions",
        "builder_resumes", "builder_resume_versions", "job_artifacts",
        "user_roles", "subscriptions", "extension_tokens", "prompt_logs",
        "ai_providers", "ai_models", "ai_cost_logs",
    ]
    for t in tables:
        cur.execute(f"SELECT count(*) FROM {t}")
        print(f"  {t}: {cur.fetchone()[0]}")
    cur.close()
    dst.close()
    print("[4/4] Done!")


def main():
    step1_check_temp_db()
    user_map = step2_migrate_users()
    step3_migrate_data(user_map)
    step4_verify()


if __name__ == "__main__":
    main()
