-- Debug script to check current team classifications and conferences
-- Run this to see what data exists before running the migration

-- Check current classifications
SELECT 
    classification,
    COUNT(*) as team_count
FROM teams 
GROUP BY classification
ORDER BY classification;

-- Check conferences without classification
SELECT 
    conference,
    COUNT(*) as team_count,
    STRING_AGG(name, ', ') as sample_teams
FROM teams 
WHERE classification IS NULL
GROUP BY conference
ORDER BY conference;

-- Check all conferences with their current classifications
SELECT 
    conference,
    classification,
    COUNT(*) as team_count
FROM teams 
GROUP BY conference, classification
ORDER BY conference, classification;

-- Sample of teams to verify data
SELECT 
    name,
    conference,
    classification
FROM teams 
WHERE name IN ('Alabama', 'Georgia', 'Ohio State', 'Michigan', 'Texas', 'Oklahoma')
ORDER BY name;