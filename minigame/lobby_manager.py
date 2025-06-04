from .models import Lobby

class LobbyManager:
    def __init__(self):
        self.lobbies = {}
        self.next_lobby_id = 1

    def create_lobby(self, max_players=20, min_players=2):
        lobby_id = f"lobby_{self.next_lobby_id}"
        self.next_lobby_id += 1
        new_lobby = Lobby(lobby_id, max_players, min_players)
        self.lobbies[lobby_id] = new_lobby
        print(f"Created new lobby with ID: {lobby_id}")
        return new_lobby
    
    def get_lobby(self, lobby_id):
        return self.lobbies.get(lobby_id, None)
    
    def find_available_lobby(self, player):
        for lobby in self.lobbies.items():
            if len(lobby.players) < lobby.max_players and lobby.game_status == "waiting_for_players":
                return lobby
        return self.create_lobby()
    
    def remove_lobby(self, lobby_id):
        if lobby_id in self.lobbies:
            del self.lobbies[lobby_id]
            print(f"Removed lobby with ID: {lobby_id}")
            return True
        print(f"Failed to remove lobby with ID: {lobby_id}")
        return False
    
    def list_lobbies_status(self):
        return [lobby.get_lobby_status() for lobby in self.lobbies.values()]