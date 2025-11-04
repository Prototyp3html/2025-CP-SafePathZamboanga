FROM osrm/osrm-backend

# Copy pre-built OSRM data files
COPY ../backend/osrm-data/zamboanga-truck.osrm* /data/

# Expose port
EXPOSE 5000

# Start OSRM routing server with MLD algorithm
CMD ["osrm-routed", "--algorithm", "mld", "/data/zamboanga-truck.osrm", "--ip", "0.0.0.0", "--port", "5000"]
