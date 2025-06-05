from typing import Optional
import time
import threading
from lobby_manager import LobbyManager
from models import Player, GameStatus

class GameRunner:
    def __init__(self, lobby_manager, tick_interval=1.0):
        self.lobby_manager = lobby_manager
        self.is_running = False
        self._update_thread: Optional[threading.Thread] = None
        self.tick_interval = tick_interval
        self.prize_callback = None

    def start(self):
        if self.is_running:
            return
        self.is_running = True
        self._update_thread = threading.Thread(target=self._game_loop, daemon=True)
        self._update_thread.start()

    def _game_loop(self):
        while self.is_running:
            start_time = time.time()
            try:
                lobbies_to_update = list(self.lobby_manager.lobbies.values())
                for lobby in lobbies_to_update:
                    lobby.update()
                self.lobby_manager.cleanup_empty_or_ended_lobbies()

            except Exception as e:
                print(f"Error in game loop: {e}")
            
            elapsed_time = time.time() - start_time
            sleep_time = self.tick_interval - elapsed_time
            if sleep_time > 0:
                time.sleep(sleep_time)
        print("GameRunner loop stopped.")

    def stop(self):
        if not self.is_running:
            print("GameRunner is not running.")
            return

        print("Stopping GameRunner...")
        self.is_running = False
        if self._update_thread and self._update_thread.is_alive():
            print("Waiting for game loop thread to join...")
            self._update_thread.join(timeout=self.tick_interval * 2 + 1)
            if self._update_thread.is_alive():
                print("Warning: Game loop thread did not join in time.")
            else:
                print("Game loop thread joined successfully.")
        self._update_thread = None
        print("GameRunner stopped.")

    def get_lobby_manager(self) -> LobbyManager:
        return self.lobby_manager

    def update_lobbies(self):
        updated_lobby_ids = []
        
        lobbies_to_update = list(self.lobby_manager.lobbies.values())
        for lobby in lobbies_to_update:
            old_status = lobby.game_status
            lobby.update()
            
            if lobby.game_status != old_status:
                updated_lobby_ids.append(lobby.lobby_id)
        
        self.lobby_manager.cleanup_empty_or_ended_lobbies()
        return updated_lobby_ids