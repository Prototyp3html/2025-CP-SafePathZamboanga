FROM osrm/osrm-backend

# Copy OSRM data files
COPY . /data

# Expose port 5000 (OSRM default)
EXPOSE 5000

# Start OSRM with your Zamboanga data - use --ip instead of --host
CMD ["osrm-routed", "--algorithm", "ch", "/data/zamboanga_roads.osrm", "--ip", "0.0.0.0", "--port", "5000"]