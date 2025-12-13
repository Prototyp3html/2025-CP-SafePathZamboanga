"""
Custom logging handler that captures logs for frontend display
"""
import logging


class FrontendLogCapture(logging.Handler):
    """Custom logging handler that stores logs for frontend retrieval"""
    
    def __init__(self, flood_update_state):
        super().__init__()
        self.flood_update_state = flood_update_state
        
    def emit(self, record):
        """Store log messages in the flood update state"""
        try:
            # Format the log message
            msg = self.format(record)
            
            # Only capture important logs (INFO level and above for special messages)
            if "FLOODED" in msg or "FLOOD START" in msg or "FLOOD END" in msg or "completed" in msg or "failed" in msg:
                self.flood_update_state.add_log(msg)
        except Exception:
            self.handleError(record)
