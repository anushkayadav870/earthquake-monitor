MATCH ()-[r:POSSIBLE_AFTERSHOCK_OF]->() 
RETURN properties(r) 
LIMIT 1;

MATCH ()-[r:PART_OF_SEQUENCE]->() 
RETURN count(r);
