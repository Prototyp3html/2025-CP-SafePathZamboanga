FROM osrm/osrm-backend

# Copy OSRM data files
COPY . /data

# Expose port from Railway environment
EXPOSE $PORT

# Start OSRM with your Zamboanga data on Railway port
CMD ["osrm-routed", "--algorithm", "ch", "/data/zamboanga_roads.osrm", "--host", "0.0.0.0", "--port", "$PORT"]