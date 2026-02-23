-- Enable Realtime for visits and friends tables
-- This allows the client to listen for new visits from friends and update the feed automatically.

ALTER PUBLICATION supabase_realtime ADD TABLE visits;
ALTER PUBLICATION supabase_realtime ADD TABLE friends;
