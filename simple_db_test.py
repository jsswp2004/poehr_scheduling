#!/usr/bin/env python3
"""
Simple database connection test for Cloud SQL
"""
import psycopg2
import os

def test_connection():
    try:
        # Direct connection using psycopg2
        conn = psycopg2.connect(
            host='/cloudsql/poehr-364520:us-central1:poehr-db-instance',
            database='poehr_db',
            user='jsswp2004',
            password='krat25Miko!'
        )
        
        cursor = conn.cursor()
        cursor.execute('SELECT version();')
        version = cursor.fetchone()
        print(f"SUCCESS: Connected to PostgreSQL: {version[0]}")
        
        cursor.execute('SELECT 1;')
        result = cursor.fetchone()
        print(f"SUCCESS: Test query result: {result[0]}")
        
        cursor.close()
        conn.close()
        print("SUCCESS: Database connection test completed successfully!")
        
    except Exception as e:
        print(f"ERROR: Database connection failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    print("Testing database connection...")
    test_connection()
