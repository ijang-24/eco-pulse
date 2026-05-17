-- Migration Script: Add `pickup_requests` table
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS "pickup_requests" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "weight_estimate" VARCHAR(50) NOT NULL,
    "waste_types" VARCHAR(100) NOT NULL,
    "pickup_address" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "pickup_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pickup_requests_pkey" PRIMARY KEY ("id")
);

-- Add Foreign Key constraint to link pickup_requests to users
ALTER TABLE "pickup_requests" ADD CONSTRAINT "pickup_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
