FROM osrm/osrm-backend

# Copy OSRM data files
COPY . /data

# Expose port 5000 (OSRM default)
EXPOSE 5000

# Process the OSM data and start OSRM server
# First extract the graph, then partition it, then start the server
RUN osrm-extract -p /opt/car.lua /data/zamboanga.osm.pbf && \
    osrm-partition /data/zamboanga.osrm && \
    osrm-customize /data/zamboanga.osrm

# Start OSRM with processed data using MLD algorithm
CMD ["osrm-routed", "--algorithm", "mld", "/data/zamboanga.osrm", "--ip", "0.0.0.0", "--port", "5000"]