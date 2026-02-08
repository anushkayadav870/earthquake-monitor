// 1. **Visual Overview**: See nodes and connections (limit to prevent browser crash)
MATCH (n)-[r]->(m) 
RETURN n, r, m 
LIMIT 50;

// 2. **Chain Analysis**: Visualize specific earthquake sequences
MATCH path = (e:Earthquake {mag: 6.0})-[*1..3]->(other) 
RETURN path 
LIMIT 10;

// 3. **Cluster Visualization**: See how eathquakes group into clusters
MATCH (c:Cluster)<-[:BELONGS_TO]-(e:Earthquake)
RETURN c, e
LIMIT 50;

// 4. **Spatial Check**: See events linked by proximity (NEAR)
MATCH (e1:Earthquake)-[r:NEAR]->(e2:Earthquake)
RETURN e1, r, e2
LIMIT 30;
