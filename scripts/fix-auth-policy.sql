-- Fix for authentication error: Add missing INSERT policy for profiles
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/fzlrhmjdjjzcgstaeblu/sql

-- Add INSERT policy so users can create their own profile
CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
