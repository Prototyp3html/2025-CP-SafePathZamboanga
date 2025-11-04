FROM osrm/osrm-backend
COPY data/ /data/
EXPOSE 5000
CMD ["osrm-routed", "--algorithm", "mld", "/data/zamboanga-jeepney.osrm", "--ip", "0.0.0.0", "--port", "5000"]
