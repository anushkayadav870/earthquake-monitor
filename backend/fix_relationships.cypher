// 1. Delete the bad/deprecated relationships
MATCH ()-[r:POSSIBLE_AFTERSHOCK_OF]->() DELETE r;
MATCH ()-[r:PART_OF_SEQUENCE]->() DELETE r; 

// 2. Re-create AFTERSHOCK_OF / FORESHOCK_OF from scratch based on spatial/temporal proximity
MATCH (new:Earthquake)
MATCH (other:Earthquake)
WHERE other.id <> new.id
AND other.mag >= 3.0
AND new.location IS NOT NULL AND other.location IS NOT NULL

WITH new, other, 
     point.distance(new.location, other.location) / 1000 AS dist_km,
     (toInteger(new.time) - toInteger(other.time)) / (1000 * 60 * 60 * 24.0) AS days_diff
     
WHERE dist_km < 50 
AND abs(days_diff) <= 7 

// Determine relationship type dynamically
FOREACH (_ IN CASE WHEN days_diff > 0 THEN [1] ELSE [] END |
    MERGE (new)-[r:AFTERSHOCK_OF]->(other)
    SET r.distance_km = dist_km, r.time_diff_days = days_diff
)
FOREACH (_ IN CASE WHEN days_diff < 0 THEN [1] ELSE [] END |
    MERGE (new)-[r:FORESHOCK_OF]->(other)
    SET r.distance_km = dist_km, r.time_diff_days = days_diff
);

// 3. Re-verify Triggered Events (Cascades)
MATCH (new:Earthquake)-[:ON_FAULTLINE]->(fz1:FaultZone)
MATCH (other:Earthquake)-[:ON_FAULTLINE]->(fz2:FaultZone)
WHERE fz1 <> fz2 
AND other.id <> new.id
AND other.mag >= 4.0

WITH new, other, fz1, fz2,
     point.distance(new.location, other.location) / 1000 AS dist_km,
     abs(toInteger(new.time) - toInteger(other.time)) / (1000 * 60 * 60.0) AS hours_diff
     
WHERE dist_km < 200 AND hours_diff < 48
MERGE (other)-[r:TRIGGERED]->(new)
SET r.distance_km = dist_km,
    r.hours_diff = hours_diff,
    r.from_fault = fz2.name,
    r.to_fault = fz1.name;
