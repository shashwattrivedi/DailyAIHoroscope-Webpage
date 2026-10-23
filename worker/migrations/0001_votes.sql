-- One row per visitor, date and sign: did the line feel true? model is the one that
-- wrote the line (from arena:<date>), NULL for dates from before the arena.
CREATE TABLE votes (
  date TEXT NOT NULL,
  sign TEXT NOT NULL,
  voter TEXT NOT NULL,
  felt INTEGER NOT NULL CHECK (felt IN (0, 1)),
  model TEXT,
  at TEXT NOT NULL,
  PRIMARY KEY (date, sign, voter)
);
CREATE INDEX votes_model ON votes (date, model);

-- Votes per IP address and UTC day, to stop scripted voting. The IP is only kept as a
-- hash with a salt that changes daily and is deleted after two days; rows go after a week.
CREATE TABLE ip_caps (
  day TEXT NOT NULL,
  ip TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (day, ip)
);
