import uuid
from enum import Enum

class GameStatus(Enum):
    WAITING_FOR_PLAYERS = "waiting_for_players"
    VOTING_FOR_THEME = "voting_for_theme"
    DRAWING = "drawing"
    VOTING_FOR_DRAWINGS = "voting_for_drawings"
    SHOWCASING_RESULTS = "showcasing_results"
    ENDED = "ended"

class Player:
    def __init__(self, player_id, name):
        self,player_id = player_id
        self.name = name
        self.drawing = None
        self.votes_cast = {}
        self.score = 0
        self.is_ready = False

    def __repr__(self):
        return f"Player(id={self.player_id}, name={self.name}, score={self.score})"
    
class Drawing:
    def __init__(self, player_id, drawing_data, drawing_theme):
        self.id = uuid.uuid4()
        self.player_id = player_id
        self.drawing_data = drawing_data
        self.drawing_theme = drawing_theme
        self.votes_received = 0

    def __repr__(self):
        return f"Drawing(id={self.id}, player_id={self.player_id}, theme={self.drawing_theme})"
    
class Lobby:
    def __init__(self, lobby_id, max_players=20, min_players=2):
        self.lobby_id = lobby_id
        self.players = {}
        self.game_status = GameStatus.WAITING_FOR_PLAYERS
        self.max_players = max_players
        self.min_players = min_players
        self.current_game_id = None
        self.color_theme_votes = {}
        self.available_color_themes = []
        self.chosen_color_theme = None
        self.drawing_themes = ["Mythical Creature", "Dream Landscape", "Futuristic City", "Abstract Emotion", "Favorite Food"]
        self.current_drawing_theme = None
        self.game_timer = 0
        self.drawings_submitted = {}
    
    def add_player(self, player):
        if len(self.players) < self.max_players and self.game_status == GameStatus.WAITING_FOR_PLAYERS:
            if player.player_id not in self.players:
                self.players[player.player_id] = player
                print(f"Player {player.name} joined lobby {self.lobby_id}")
                if len(self.players) >= self.min_players_to_start and self.game_state == GameStatus.WAITING_FOR_PLAYERS:
                    pass
                return True
        print(f"Failed to add player {player.name} to lobby {self.lobby_id}")
        return False
    
    def remove_player(self, player_id):
        if player_id in self.players:
            del self.players[player_id]
            print(f"Player {player_id} removed from lobby {self.lobby_id}")
            return True
        print(f"Failed to remove player {player_id} from lobby {self.lobby_id}")
        return False
    
    def get_lobby_status(self):
        return {
            "lobby_id": self.lobby_id,
            "players": [p.name for p in self.players.values()],
            "player_count": len(self.players),
            "game_state": self.game_state.value,
            "max_players": self.max_players,
            "min_players_to_start": self.min_players_to_start
        }
    
    def __repr__(self):
        return f"Lobby(id={self.lobby_id}, player_count={len(self.players)}, game_state={self.game_state.value})"