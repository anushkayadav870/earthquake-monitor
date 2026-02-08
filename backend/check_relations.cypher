// 1. Count all relationships by type
MATCH ()-[r]->() 
RETURN type(r) as RelationType, count(r) as Count
ORDER BY Count DESC;

// 2. See a sample of relationships (e.g., Aftershocks)
MATCH (a:Earthquake)-[r:PART_OF_SEQUENCE]->(b:Earthquake)
RETURN a.id, a.mag, type(r), b.id, b.mag
LIMIT 10;

// 3. Find clusters of events (chains)
MATCH path = (a:Earthquake)-[:PART_OF_SEQUENCE*2..]->(b:Earthquake)
RETURN path
LIMIT 5;

// 4. Check events near a specific location (if spatial index used, otherwise approx)
MATCH (e:Earthquake)
WHERE e.mag > 5.0
RETURN e.place, e.mag, e.time
ORDER BY e.time DESC
LIMIT 10;
