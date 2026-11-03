-- Demo data for the README screenshots: run it against a throwaway database.
--   sqlite3 "%APPDATA%\com.tool.suoji.preview\suoji.db" ".read scripts/demo-seed.sql"
-- Create the database in English first: switch the UI language to English, then
-- copy this file. For Chinese screenshots use demo-seed.zh.sql instead.

DELETE FROM tasks; DELETE FROM day_notes; DELETE FROM meta WHERE key LIKE 'closed_out%';
INSERT INTO day_notes(date,note,created_at) VALUES('2026-11-02','Finish the Q4 budget numbers before leaving - do not push it to Friday','2026-11-02T18:40:00');

INSERT INTO tasks(id,title,note,bucket,plan_date,first_seen_date,due_at,done,done_at,roll_count,last_rolled_at,sort_order,deleted,created_at,updated_at) VALUES
('d1','Finish the Q4 budget numbers','Two branch spreadsheets still unchecked','today','2026-11-03','2026-10-22',NULL,0,NULL,5,'2026-11-03T00:00:05',0,0,'2026-10-22T09:12:00','2026-11-03T00:00:05'),
('d2','Align with product on the home redesign',NULL,'today','2026-11-03','2026-11-02','2026-11-03T15:30',0,NULL,1,'2026-11-03T00:00:05',1,0,'2026-11-02T11:20:00','2026-11-03T00:00:05'),
('d3','Reply to Sarah',NULL,'today','2026-11-03','2026-11-03',NULL,0,NULL,0,NULL,2,0,'2026-11-03T09:05:00','2026-11-03T09:05:00'),
('d4','Send the weekly report',NULL,'today','2026-11-03','2026-11-01',NULL,1,'2026-11-03T10:12:00',2,'2026-11-03T00:00:05',3,0,'2026-11-01T17:30:00','2026-11-03T10:12:00'),
('d5','Get the expense form signed',NULL,'today','2026-11-03','2026-11-03',NULL,1,'2026-11-03T14:05:00',0,NULL,4,0,'2026-11-03T09:40:00','2026-11-03T14:05:00'),
('i1','Ask finance how to get an invoice title',NULL,'inbox',NULL,'2026-10-15',NULL,0,NULL,7,'2026-10-28T00:00:05',0,0,'2026-10-15T10:00:00','2026-10-28T00:00:05'),
('i2','Get a monitor arm',NULL,'inbox',NULL,'2026-10-30',NULL,0,NULL,0,NULL,1,0,'2026-10-30T20:11:00','2026-10-30T20:11:00'),
('i3','Book the dentist follow-up',NULL,'inbox',NULL,'2026-11-01',NULL,0,NULL,2,'2026-11-02T00:00:05',2,0,'2026-11-01T08:30:00','2026-11-02T00:00:05'),
('h1','Fix the CI cache',NULL,'today','2026-11-01','2026-11-01',NULL,1,'2026-11-01T16:20:00',0,NULL,0,0,'2026-11-01T09:00:00','2026-11-01T16:20:00'),
('h2','Tidy up the weekly report template',NULL,'today','2026-10-30','2026-10-30',NULL,1,'2026-10-30T09:40:00',1,'2026-10-30T00:00:05',0,0,'2026-10-29T18:00:00','2026-10-30T09:40:00'),
('h3','Confirm the release window with ops',NULL,'today','2026-10-29','2026-10-29',NULL,1,'2026-10-29T15:00:00',0,NULL,0,0,'2026-10-29T10:00:00','2026-10-29T15:00:00');
