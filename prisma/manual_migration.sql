-- =====================================================
-- Eco-Pulse Manual Migration
-- Run this in Supabase Dashboard > SQL Editor
-- =====================================================

-- 1. Add missing columns to users table (if not exists)
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_log_date TIMESTAMP;

-- 2. Add missing columns to waste_logs table (if not exists)
ALTER TABLE waste_logs ADD COLUMN IF NOT EXISTS ai_confidence DECIMAL(5,2);
ALTER TABLE waste_logs ADD COLUMN IF NOT EXISTS ai_suggested_type VARCHAR(100);

-- 3. Create notifications table (if not exists)
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    type VARCHAR(50),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 4. Create index for faster notification queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);

-- Done! Verify with:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'waste_logs';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'users';
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'notifications';
