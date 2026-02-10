// 1. Migrate PART_OF_SEQUENCE -> AFTERSHOCK_OF / FORESHOCK_OF
MATCH (a)-[r:PART_OF_SEQUENCE]->(b)
WITH a, r, b
FOREACH (_ IN CASE WHEN r.time_diff_days > 0 THEN [1] ELSE [] END |
    MERGE (a)-[new:AFTERSHOCK_OF]->(b)
    SET new = r
)
FOREACH (_ IN CASE WHEN r.time_diff_days <= 0 THEN [1] ELSE [] END |
    MERGE (a)-[new:FORESHOCK_OF]->(b)
    SET new = r
)
DELETE r;

// 2. Migrate POSSIBLE_TRIGGERED_EVENT -> TRIGGERED
MATCH (a)-[r:POSSIBLE_TRIGGERED_EVENT]->(b)
MERGE (a)-[new:TRIGGERED]->(b)
SET new = r
DELETE r;

// 3. Migrate BELONGS_TO -> BELONGS_TO_CLUSTER
MATCH (a)-[r:BELONGS_TO]->(b)
MERGE (a)-[new:BELONGS_TO_CLUSTER]->(b)
SET new = r
DELETE r;

// 4. Migrate ON_FAULT -> ON_FAULTLINE
MATCH (a)-[r:ON_FAULT]->(b)
MERGE (a)-[new:ON_FAULTLINE]->(b)
SET new = r
DELETE r;

// 5. Create EPICENTER_OF for existing clusters
MATCH (c:Cluster)
MATCH (e:Earthquake)-[:BELONGS_TO_CLUSTER]->(c)
WITH c, e
ORDER BY e.mag DESC
WITH c, head(collect(e)) as epicenter
MERGE (c)-[:EPICENTER_OF]->(epicenter);

// 6. Ensure OCCURRED_IN exists for all events with location data
// (This is best effort based on existing Region nodes)
MATCH (e:Earthquake)
MATCH (c:City)<-[:OCCURRED_NEAR]-(e)
MATCH (c)-[:LOCATED_IN]->(r:Region)
MERGE (e)-[:OCCURRED_IN]->(r);
