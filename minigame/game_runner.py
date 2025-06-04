import time
import threading
from lobby_manager import LobbyManager
from models import Player,GameStatus

class GameRunner:
    def __init__(self):
        self.lobby_manager = LobbyManager()
        self.is_running = False
        self._update_thread = None
        self.tick_interval = 1.0

    def start(self):
        if self.is_running:
            print("GameRunner is already running.")
            return
        self.is_running = True
        if not self.lobby_manager.lobbies:
            self.lobby_manager.create_lobby(lobby_id="default_lobby")
        self._update_thread = threading.Thread(target=self._game_loop, daemon=True)
        self._update_thread.start()
        print("GameRunner started. Lobbies will be updated periodically.")

    def _game_loop(self):
        while self.is_running:
            active_lobbies = list(self.lobby_manager.lobbies.values())
            for lobby in active_lobbies:
                try:
                    lobby.update_lobby_state()
                    if lobby.game_state == GameStatus.ENDED and not lobby.players:
                        print(f"Removing empty and ended lobby: {lobby.lobby_id}")
                        self.lobby_manager.remove_lobby(lobby.lobby_id)
                except Exception as e:
                    print(f"Error updating lobby {lobby.lobby_id}: {e}")
            time.sleep(self.tick_interval)
        print("GameRunner loop stopped.")

    def stop(self):
        print("Stopping GameRunner......")
        self.is_running = False
        if self._update_thread and self._update_thread.is_alive():
            self._update_thread.join(timeout=self.tick_interval*2)
        print("GameRunner stopped")
    
    def get_status_overview(self):
        return self.lobby_manager.list_lobbies_status()
    
    