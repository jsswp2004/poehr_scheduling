#!/bin/bash
# Script to create the missing password reset table in Azure PostgreSQL

echo "🔧 Creating missing password reset table in Azure PostgreSQL..."

# Database connection details
HOST="poehr-scheduling-postgres.postgres.database.azure.com"
PORT="5432"
DBNAME="poehr_db"
USERNAME="poehr_admin"

echo "📊 Connecting to Azure PostgreSQL database..."
echo "Host: $HOST"
echo "Database: $DBNAME"
echo "User: $USERNAME"

# Run the SQL script
psql "host=$HOST port=$PORT dbname=$DBNAME user=$USERNAME sslmode=require" << 'EOF'
-- Create the missing django_rest_passwordreset_resetpasswordtoken table
CREATE TABLE IF NOT EXISTS django_rest_passwordreset_resetpasswordtoken (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    key VARCHAR(64) NOT NULL UNIQUE,
    ip_address INET,
    user_agent TEXT NOT NULL DEFAULT '',
    user_id INTEGER NOT NULL,
    CONSTRAINT django_rest_passwordreset_resetpasswordtoken_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES users_customuser(id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS django_rest_passwordreset_resetpasswordtoken_user_id_idx 
    ON django_rest_passwordreset_resetpasswordtoken(user_id);

CREATE INDEX IF NOT EXISTS django_rest_passwordreset_resetpasswordtoken_key_idx 
    ON django_rest_passwordreset_resetpasswordtoken(key);

-- Verify table creation
SELECT 'Password reset table created successfully!' as result;
EOF

echo "✅ Password reset table creation completed!"
