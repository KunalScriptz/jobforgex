#!/usr/bin/env python3
"""
Promote a user to admin (role='admin' in user_roles). There is no in-app UI
for this — it's the interim mechanism until/unless an admin-invite flow is built.

Usage:
  docker exec jobforgex-backend-1 python /app/scripts/promote_admin.py user@example.com

The user must log out and log back in afterward — the JWT's `role` claim is
baked in at login time and won't reflect the DB change until a fresh token
is issued.
"""

import os
import sys

import psycopg2

DB_HOST = os.getenv("DB_HOST", "postgres")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_USER = os.getenv("DB_USER", "jobforgex")
DB_PASSWORD = os.getenv("DB_PASSWORD", "jobforgex")
DB_NAME = os.getenv("DB_NAME", "jobforgex")


def main():
    if len(sys.argv) != 2:
        print("Usage: promote_admin.py <email>")
        sys.exit(1)

    email = sys.argv[1].strip().lower()
    conn = psycopg2.connect(host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASSWORD, dbname=DB_NAME)
    try:
        cur = conn.cursor()
        cur.execute("SELECT id FROM users WHERE lower(email) = %s", (email,))
        row = cur.fetchone()
        if not row:
            print(f"No user found with email {email!r}")
            sys.exit(1)
        user_id = row[0]

        cur.execute("SELECT id FROM user_roles WHERE user_id = %s", (user_id,))
        if cur.fetchone():
            cur.execute("UPDATE user_roles SET role = 'admin' WHERE user_id = %s", (user_id,))
        else:
            cur.execute(
                "INSERT INTO user_roles (id, user_id, role) VALUES (gen_random_uuid(), %s, 'admin')", (user_id,)
            )
        conn.commit()
        print(f"{email} is now an admin. They must log out and back in for it to take effect.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
