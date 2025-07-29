#!/usr/bin/env python
"""
Simple script to create Django tables directly using SQL
"""
import psycopg2
import sys

def create_django_tables():
    """Create the basic Django tables"""
    
    # Database connection parameters
    conn_params = {
        'host': '/cloudsql/poehr-364520:us-central1:poehr-db-instance',
        'database': 'poehr_db',
        'user': 'jsswp2004',
        'password': 'krat25Miko!'
    }
    
    # SQL commands to create basic Django tables
    sql_commands = [
        """
        CREATE TABLE IF NOT EXISTS django_migrations (
            id SERIAL PRIMARY KEY,
            app VARCHAR(255) NOT NULL,
            name VARCHAR(255) NOT NULL,
            applied TIMESTAMP WITH TIME ZONE NOT NULL
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS django_content_type (
            id SERIAL PRIMARY KEY,
            app_label VARCHAR(100) NOT NULL,
            model VARCHAR(100) NOT NULL,
            UNIQUE(app_label, model)
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS auth_permission (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            content_type_id INTEGER NOT NULL,
            codename VARCHAR(100) NOT NULL,
            UNIQUE(content_type_id, codename)
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS auth_group (
            id SERIAL PRIMARY KEY,
            name VARCHAR(150) UNIQUE NOT NULL
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS auth_group_permissions (
            id SERIAL PRIMARY KEY,
            group_id INTEGER NOT NULL,
            permission_id INTEGER NOT NULL,
            UNIQUE(group_id, permission_id)
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS django_session (
            session_key VARCHAR(40) PRIMARY KEY,
            session_data TEXT NOT NULL,
            expire_date TIMESTAMP WITH TIME ZONE NOT NULL
        );
        """,
        """
        CREATE INDEX IF NOT EXISTS django_session_expire_date_a5c62663 
        ON django_session(expire_date);
        """
    ]
    
    try:
        # Connect to database
        conn = psycopg2.connect(**conn_params)
        cur = conn.cursor()
        
        print("Connected to database successfully!")
        
        # Execute each SQL command
        for i, sql in enumerate(sql_commands):
            try:
                cur.execute(sql)
                print(f"✅ Executed command {i+1}/{len(sql_commands)}")
            except Exception as e:
                print(f"⚠️  Command {i+1} failed: {e}")
        
        # Commit changes
        conn.commit()
        print("✅ All changes committed successfully!")
        
        # Close connection
        cur.close()
        conn.close()
        print("✅ Database connection closed")
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == "__main__":
    print("Creating Django tables...")
    success = create_django_tables()
    if success:
        print("✅ Django tables created successfully!")
        sys.exit(0)
    else:
        print("❌ Failed to create Django tables")
        sys.exit(1)
