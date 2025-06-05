import uuid
from typing import Optional, Dict
from models import Lobby, Player, GameStatus

class LobbyManager:
    def __init__(self):
        self.lobbies: Dict[str, Lobby] = {}

    def create_lobby(self, max_players: int = 8, min_players: int = 2) -> Lobby:
        lobby_id = str(uuid.uuid4())
        lobby = Lobby(lobby_id=lobby_id, max_players=max_players, min_players=min_players)
        self.lobbies[lobby_id] = lobby
        return lobby

    def get_lobby(self, lobby_id: str) -> Optional[Lobby]:
        return self.lobbies.get(lobby_id)

    def find_available_lobby(self) -> Lobby:
        for lobby in self.lobbies.values():
            if lobby.game_status == GameStatus.WAITING_FOR_PLAYERS and len(lobby.players) < lobby.max_players:
                return lobby
        return self.create_lobby()
        
    def remove_lobby(self, lobby_id: str):
        if lobby_id in self.lobbies:
            del self.lobbies[lobby_id]
            
    def get_all_lobbies_status(self) -> dict:
        return {
            lobby_id: lobby.get_lobby_state()
            for lobby_id, lobby in self.lobbies.items()
        }
        
    def get_all_lobbies_summary(self) -> list:
        return [
            {
                'id': lobby.lobby_id,
                'player_count': len(lobby.players),
                'max_players': lobby.max_players,
                'status': lobby.game_status.value,
            }
            for lobby in self.lobbies.values()
        ]

    def cleanup_empty_or_ended_lobbies(self):
        lobbies_to_remove = []
        for lobby_id, lobby in self.lobbies.items():
            if lobby.game_status == GameStatus.WAITING_FOR_PLAYERS and not lobby.players:
                lobbies_to_remove.append(lobby_id)
            elif lobby.game_status == GameStatus.ENDED:
                pass
        for lobby_id in lobbies_to_remove:
            self.remove_lobby(lobby_id)