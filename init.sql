CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert 100,000 users instantly using generate_series
INSERT INTO users (username, email)
SELECT 
    'user_' || i,
    'user_' || i || '@example.com'
FROM generate_series(1, 100000) as i;

-- Create index for faster lookups
CREATE INDEX idx_users_id ON users(id);
