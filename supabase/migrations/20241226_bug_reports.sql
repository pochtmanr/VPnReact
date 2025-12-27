-- Bug Reports table for user feedback
-- Migration: 20241226_bug_reports

-- Create bug_reports table
CREATE TABLE IF NOT EXISTS public.bug_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id TEXT,
    description TEXT NOT NULL,
    app_version TEXT,
    platform TEXT CHECK (platform IN ('ios', 'android', 'web')),
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert bug reports (even unauthenticated users)
CREATE POLICY "Anyone can insert bug reports"
    ON public.bug_reports FOR INSERT
    WITH CHECK (true);

-- Add updated_at trigger
CREATE TRIGGER update_bug_reports_updated_at
    BEFORE UPDATE ON public.bug_reports
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries by status
CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON public.bug_reports(status);
CREATE INDEX IF NOT EXISTS idx_bug_reports_created_at ON public.bug_reports(created_at DESC);
