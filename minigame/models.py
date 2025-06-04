import uuid
from enum import Enum
import time
import random

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
        self.voted_color_theme = None

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
        self.phase_duration = 0
        self.drawings_submitted = {}
        self.ready_check_timer = 0
        self.ready_check_duration = 30
    
    def add_player(self, player):
        if len(self.players) < self.max_players and self.game_status == GameStatus.WAITING_FOR_PLAYERS:
            if player.player_id not in self.players:
                self.players[player.player_id] = player
                print(f"Player {player.name} joined lobby {self.lobby_id}")
                if len(self.players) >= self.min_players_to_start and not self.all_players_ready():
                    pass
                return True
        print(f"Failed to add player {player.name} to lobby {self.lobby_id}")
        return False
    
    def remove_player(self, player_id):
        if player_id in self.players:
            player_name = self.players[player_id].name
            if self.players[player_id].voted_color_theme:
                theme_voted = self.players[player_id].voted_color_theme
                if theme_voted in self.color_theme_votes:
                    self.color_theme_votes[theme_voted] -= 1
                    if self.color_theme_votes[theme_voted] == 0:
                        del self.color_theme_votes[theme_voted]
            
            del self.players[player_id]
            print(f"Player {player_name} left lobby {self.lobby_id}")

            if len(self.players) < self.min_players_to_start and self.game_state != GameStatus.WAITING_FOR_PLAYERS and self.game_state != GameStatus.ENDED:
                print(f"Not enough players in lobby {self.lobby_id}. Resetting game.")
                self.reset_lobby()
            return True
        return False
    
    def set_player_ready(self, player_id, is_ready=True):
        if player_id in self.players and self.game_state == GameStatus.WAITING_FOR_PLAYERS:
            self.players[player_id].is_ready = is_ready
            print(f"Player {self.players[player_id].name} is {'ready' if is_ready else 'not ready'}.")
            self.check_start_theme_voting()
            return True
        return False
    
    def all_players_ready(self):
        if not self.players:
            return False
        return all(p.is_ready for p in self.players.values())
    
    def check_start_theme_voting(self):
        if self.game_state == GameStatus.WAITING_FOR_PLAYERS and len(self.players) >= self.min_players_to_start and self.all_players_ready():
            self.start_color_theme_voting()

    def start_color_theme_voting(self):
        if self.game_state == GameStatus.WAITING_FOR_PLAYERS and len(self.players) >= self.min_players_to_start:
            self.game_state = GameStatus.VOTING_FOR_THEME
            self.color_theme_votes = {theme: 0 for theme in random.sample(self.available_color_themes, k=min(3, len(self.available_color_themes)))}
            for player in self.players.values():
                player.voted_color_theme = None
            self.game_timer_start_time = time.time()
            self.phase_duration = 30 
            self.current_game_id = str(uuid.uuid4())
            print(f"Lobby {self.lobby_id} (Game ID: {self.current_game_id}): Color theme voting started. Options: {list(self.color_theme_votes.keys())}")
        else:
            print(f"Lobby {self.lobby_id}: Cannot start theme voting. Conditions not met (State: {self.game_state}, Players: {len(self.players)}).")

    def cast_color_theme_vote(self, player_id, theme_choice):
        if self.game_state != GameStatus.VOTING_FOR_THEME:
            print(f"Lobby {self.lobby_id}: Cannot vote for theme, not in voting state.")
            return False
        if player_id not in self.players:
            print(f"Lobby {self.lobby_id}: Player {player_id} not in lobby.")
            return False
        player = self.players[player_id]
        if theme_choice not in self.color_theme_votes:
            print(f"Lobby {self.lobby_id}: Invalid theme choice '{theme_choice}'. Available: {list(self.color_theme_votes.keys())}")
            return False

        if player.voted_color_theme and player.voted_color_theme in self.color_theme_votes:
            self.color_theme_votes[player.voted_color_theme] -=1
        
        self.color_theme_votes[theme_choice] += 1
        player.voted_color_theme = theme_choice
        print(f"Lobby {self.lobby_id}: Player {player.name} voted for color theme '{theme_choice}'. Votes: {self.color_theme_votes}")

        if all(p.voted_color_theme is not None for p in self.players.values()):
            self.end_color_theme_voting()
        return True
    
    def end_color_theme_voting(self):
        if self.game_state != GameStatus.VOTING_FOR_THEME:
            return

        if not self.color_theme_votes:
            self.chosen_color_theme = random.choice(self.available_color_themes)
            print(f"Lobby {self.lobby_id}: No votes cast for color theme or no options. Defaulting to {self.chosen_color_theme}.")
        else:
            max_votes = -1
            top_themes = []
            for theme, votes in self.color_theme_votes.items():
                if votes > max_votes:
                    max_votes = votes
                    top_themes = [theme]
                elif votes == max_votes:
                    top_themes.append(theme)
            self.chosen_color_theme = random.choice(top_themes) if top_themes else random.choice(list(self.color_theme_votes.keys()))
        print(f"Lobby {self.lobby_id}: Color theme voting ended. Chosen theme: {self.chosen_color_theme}")
        self.start_drawing_phase()

    def start_drawing_phase(self):
        if self.game_state != GameStatus.VOTING_FOR_THEME or not self.chosen_color_theme:
            print(f"Lobby {self.lobby_id}: Cannot start drawing phase. Conditions not met.")
            return

        self.game_state = GameStatus.DRAWING
        self.current_drawing_theme = random.choice(self.drawing_themes)
        self.drawings_submitted = {player_id: None for player_id in self.players.keys()}
        for player in self.players.values():
            player.drawing = None
        self.game_timer_start_time = time.time()
        self.phase_duration = 120
        print(f"Lobby {self.lobby_id}: Drawing phase started! Theme: '{self.current_drawing_theme}'. Color Palette: '{self.chosen_color_theme}'. Time: {self.phase_duration}s.")

    def update_lobby_state(self):
        if self.game_state == GameStatus.VOTING_FOR_THEME:
            if time.time() - self.game_timer_start_time >= self.phase_duration:
                print(f"Lobby {self.lobby_id}: Color theme voting time up.")
                self.end_color_theme_voting()
        elif self.game_state == GameStatus.DRAWING:
            if time.time() - self.game_timer_start_time >= self.phase_duration:
                print(f"Lobby {self.lobby_id}: Drawing time up.")
                self.start_drawing_voting_phase()

    def reset_lobby(self):
        print(f"Lobby {self.lobby_id}: Resetting.")
        self.game_state = GameStatus.WAITING_FOR_PLAYERS
        self.current_game_id = None
        self.color_theme_votes = {}
        self.chosen_color_theme = None
        self.current_drawing_theme = None
        self.drawings_submitted = {}
        self.game_timer_start_time = 0
        self.phase_duration = 0
        for player in self.players.values():
            player.is_ready = False
            player.drawing = None
            player.votes_cast = {}
            player.score = 0
            player.voted_color_theme = None
    
    def get_lobby_status(self):
        return {
            "lobby_id": self.lobby_id,
            "game_id": self.current_game_id,
            "players": {pid: p.name for pid, p in self.players.items()},
            "player_details": {pid: {"name": p.name, "is_ready": p.is_ready, "voted_theme": p.voted_color_theme} for pid, p in self.players.items()},
            "player_count": len(self.players),
            "game_state": self.game_state.value,
            "max_players": self.max_players,
            "min_players_to_start": self.min_players_to_start,
            "color_theme_options": list(self.color_theme_votes.keys()) if self.game_state == GameStatus.VOTING_FOR_THEME else [],
            "color_theme_votes": self.color_theme_votes if self.game_state == GameStatus.VOTING_FOR_THEME else {},
            "chosen_color_theme": self.chosen_color_theme,
            "current_drawing_theme": self.current_drawing_theme,
            "time_remaining": max(0, int(self.phase_duration - (time.time() - self.game_timer_start_time))) if self.game_timer_start_time > 0 else 0,
        }
    
    def __repr__(self):
        return f"Lobby(id={self.lobby_id}, player_count={len(self.players)}, game_state={self.game_state.value})"