import uuid
import time
import random
from enum import Enum
from typing import Dict, List, Optional, Tuple

DEFAULT_CANVAS_WIDTH = 800
DEFAULT_CANVAS_HEIGHT = 600
LOBBY_MAX_PLAYERS = 20
GAME_DRAW_TIME_SECONDS = 300 
MAX_DRAW_TIME_SECONDS = 259200
GAME_VOTE_TIME_SECONDS = 60
GAME_SHOWCASE_TIME_SECONDS = 10
MIN_PLAYERS_TO_START = 2

class GameStatus(Enum):
    WAITING_FOR_PLAYERS = "waiting_for_players"
    THEME_VOTING = "theme_voting"
    DRAWING = "drawing"
    VOTING_FOR_DRAWINGS = "voting_for_drawings"
    SHOWCASING_RESULTS = "showcasing_results"
    ENDED = "ended"

class Player:
    def __init__(self, player_id: str, display_name: str):
        self.player_id = player_id
        self.display_name = display_name
        self.is_ready = False
        self.score = 0
        self.voted_for_drawing_id: Optional[str] = None
        self.color_theme_vote: Optional[str] = None
        self.drawing: Optional[Drawing] = None
        self.is_host = False

    def __eq__(self, other):
        if isinstance(other, Player):
            return self.player_id == other.player_id
        return False

    def __hash__(self):
        return hash(self.player_id)

class Drawing:
    def __init__(self, player_id: str, drawing_data: str, drawing_theme: str):
        self.drawing_id = str(uuid.uuid4())
        self.player_id = player_id
        self.drawing_data = drawing_data
        self.drawing_theme = drawing_theme
        self.votes = 0

class Lobby:
    def __init__(self, lobby_id: str, max_players: int = LOBBY_MAX_PLAYERS, min_players: int = MIN_PLAYERS_TO_START):
        self.lobby_id = lobby_id
        self.players: list[Player] = []
        self.game_status = GameStatus.WAITING_FOR_PLAYERS
        self.settings = LobbySettings()
        self.settings.max_players = max_players
        self.settings.min_players = min_players
        self.drawings: List[Drawing] = []
        self.current_drawing_theme: Optional[str] = None
        self.current_canvas_color_theme: Optional[str] = None
        self.timer_end_time: Optional[float] = None
        self.game_start_time: Optional[float] = None
        self.current_showcased_drawing_index: int = 0
        self.color_theme_votes: dict[str, int] = {}
        self.possible_color_themes = ["sunset", "forest", "ocean", "monochrome", "neon"]
        self.possible_drawing_prompts = [
            "A mythical creature",
            "A dream you had",
            "Your favorite food",
            "A city in the clouds",
            "An alien landscape",
            "A self-portrait as an animal",
            "The meaning of life",
            "A robot in love",
            "A secret garden",
            "Time travel"        ]
        self.host_id: Optional[str] = None
        self.banned_players: set[str] = set()
        self.spectators: list[Player] = []

    @property
    def max_players(self) -> int:
        return self.settings.max_players
    @property
    def min_players(self) -> int:
        return self.settings.min_players
    
    def update_settings(self, host_id: str, new_settings: dict) -> tuple[bool, str]:
        if not self.is_host(host_id):
            return False, "Only the host can change lobby settings"
        if self.game_status != GameStatus.WAITING_FOR_PLAYERS:
            return False, "Cannot change settings while game is in progress"
        if 'max_players' in new_settings:
            new_max = new_settings['max_players']
            if new_max < len(self.players):
                return False, f"Cannot set max players below current player count ({len(self.players)})"
                
        if 'min_players' in new_settings:
            new_min = new_settings['min_players']
            if new_min > self.settings.max_players:
                return False, "Minimum players cannot exceed maximum players"
        settings_changed = self.settings.update_from_dict(new_settings)
        if settings_changed:
            return True, "Settings updated successfully"
        else:
            return False, "No changes made to settings"
        
    def add_spectator(self, player: Player) -> bool:
        if not self.settings.allow_spectators:
            return False
        if player not in self.spectators:
            self.spectators.append(player)
            return True
        return False

    def set_host(self, player_id: str):
        self.host_id = player_id
        for player in self.players:
            player.is_host = (player.player_id == player_id)
    
    def is_host(self, player_id: str) -> bool:
        return self.host_id == player_id


    def add_player(self, player: Player) -> bool:
        can_join, reason = self.can_player_join(player.player_id)
        if not can_join:
            return False
        if player not in self.players:
            self.players.append(player)
            if not self.host_id:
                self.set_host(player.player_id)
            return True
        return False
    
    def can_player_join(self, player_id: str) -> tuple[bool, str]:
        if player_id in self.banned_players:
            return False, "You have been banned from this lobby"
        if len(self.players) >= self.settings.max_players:
            if self.settings.allow_spectators:
                return False, "Lobby is full, but you can join as a spectator"
            return False, "Lobby is full"
        if self.game_status != GameStatus.WAITING_FOR_PLAYERS:
            return False, "Game is already in progress"
        return True, ""
    
    def kick_player(self, host_id: str, target_player_id: str) -> tuple[bool, str]:
        if not self.is_host(host_id):
            return False, "Only the host can kick players"
        
        if target_player_id == host_id:
            return False, "Host cannot kick themselves"
        player_to_kick = None
        for player in self.players:
            if player.player_id == target_player_id:
                player_to_kick = player
                break
        
        if not player_to_kick:
            return False, "Player not found in lobby"
        self.players.remove(player_to_kick)
        
        return True, f"Player {player_to_kick.display_name} has been kicked"
    
    def ban_player(self, host_id: str, target_player_id: str) -> tuple[bool, str]:
        if not self.is_host(host_id):
            return False, "Only the host can ban players"
        
        if target_player_id == host_id:
            return False, "Host cannot ban themselves"
        player_to_ban = None
        for player in self.players:
            if player.player_id == target_player_id:
                player_to_ban = player
                break
        
        if not player_to_ban:
            return False, "Player not found in lobby"
        self.players.remove(player_to_ban)
        self.banned_players.add(target_player_id)
        
        return True, f"Player {player_to_ban.display_name} has been banned"
    
    def transfer_host(self, current_host_id: str, new_host_id: str) -> tuple[bool, str]:
        if not self.is_host(current_host_id):
            return False, "Only the host can transfer host privileges"
        new_host_exists = any(player.player_id == new_host_id for player in self.players)
        if not new_host_exists:
            return False, "Target player not found in lobby"
        
        self.set_host(new_host_id)
        return True, "Host privileges transferred"

    def remove_player(self, player_id: str):
        self.players = [p for p in self.players if p.player_id != player_id]
        if self.host_id == player_id and self.players:
            self.set_host(self.players[0].player_id)
        elif not self.players:
            self.host_id = None
        if self.game_status in [GameStatus.DRAWING, GameStatus.VOTING_FOR_DRAWINGS]:
            self.drawings = [d for d in self.drawings if d.player_id != player_id]


    def get_player(self, player_id: str) -> Optional[Player]:
        for player in self.players:
            if player.player_id == player_id:
                return player
        return None

    def set_player_ready(self, player_id: str, ready_status: bool):
        player = self.get_player(player_id)
        if player:
            player.is_ready = ready_status

    def all_players_ready(self) -> bool:
        if not self.players:
            return False
        return all(p.is_ready for p in self.players)

    def can_start_game(self) -> bool:
        return len(self.players) >= self.settings.min_players and self.all_players_ready() and self.game_status == GameStatus.WAITING_FOR_PLAYERS

    def start_theme_voting(self):
        if self.game_status == GameStatus.WAITING_FOR_PLAYERS and len(self.players) >= self.settings.min_players:
            self.game_status = GameStatus.THEME_VOTING
            self.timer_end_time = time.time() + self.settings.theme_voting_time
            self.color_theme_votes = {}

    def cast_color_theme_vote(self, player_id: str, theme: str):
        player = self.get_player(player_id)
        if player and self.game_status == GameStatus.THEME_VOTING and theme in self.possible_color_themes:
            if player.color_theme_vote:
                self.color_theme_votes[player.color_theme_vote] -=1
            
            player.color_theme_vote = theme
            self.color_theme_votes[theme] = self.color_theme_votes.get(theme, 0) + 1
            return True
        return False

    def _determine_winning_color_theme(self) -> str:
        if not self.color_theme_votes:
            return random.choice(self.possible_color_themes) 
        max_votes = 0
        winning_themes = []
        for theme, votes in self.color_theme_votes.items():
            if votes > max_votes:
                max_votes = votes
                winning_themes = [theme]
            elif votes == max_votes:
                winning_themes.append(theme)
        
        return random.choice(winning_themes) if winning_themes else random.choice(self.possible_color_themes)


    def start_drawing_phase(self):
        if self.game_status == GameStatus.THEME_VOTING: 
            self.current_canvas_color_theme = self._determine_winning_color_theme()
            self.current_drawing_theme = random.choice(self.possible_drawing_prompts) 
            self.game_status = GameStatus.DRAWING
            self.timer_end_time = time.time() + self.settings.drawing_time
            if self.settings.custom_themes:
                available_themes = self.settings.custom_themes + self.possible_drawing_prompts
            else:
                available_themes = self.possible_drawing_prompts
                
            self.current_drawing_theme = random.choice(available_themes)
            self.drawings = []
            for p in self.players:
                p.drawing = None
                p.voted_for_drawing_id = None

    def submit_drawing(self, player_id: str, drawing_data: str):
        player = self.get_player(player_id)
        if player and self.game_status == GameStatus.DRAWING and self.current_drawing_theme is not None:
            drawing = Drawing(player_id, drawing_data, self.current_drawing_theme)
            player.drawing = drawing 
            self.drawings.append(drawing)
            return True
        return False

    def start_voting_phase(self):
        if self.game_status == GameStatus.DRAWING and self.drawings:
            self.game_status = GameStatus.VOTING_FOR_DRAWINGS
            self.timer_end_time = time.time() + self.settings.voting_time
            for p in self.players:
                p.voted_for_drawing_id = None

    def cast_vote(self, voter_player_id: str, drawing_id: str) -> bool:
        voter = self.get_player(voter_player_id)
        if not voter or voter.voted_for_drawing_id:
            return False

        target_drawing = next((d for d in self.drawings if d.drawing_id == drawing_id), None)
        if target_drawing and target_drawing.player_id != voter_player_id:
            target_drawing.votes += 1
            voter.voted_for_drawing_id = drawing_id
            return True
        return False

    def start_showcasing_results(self):
        if self.game_status == GameStatus.VOTING_FOR_DRAWINGS:
            self.game_status = GameStatus.SHOWCASING_RESULTS
            self.drawings.sort(key=lambda d: d.votes, reverse=True)
            self.current_showcased_drawing_index = 0
            self.timer_end_time = time.time() + self.settings.showcase_time_per_drawing

    def next_showcase(self):
        if self.game_status == GameStatus.SHOWCASING_RESULTS:
            self.current_showcased_drawing_index += 1
            if self.current_showcased_drawing_index < len(self.drawings):
                self.timer_end_time = time.time() + self.settings.showcase_time_per_drawing
                return True
            else:
                self.end_game()
                return False
        return False

    def end_game(self):
        self.game_status = GameStatus.ENDED
        for p in self.players:
            p.is_ready = False
            p.color_theme_vote = None
            p.drawing = None
            p.voted_for_drawing_id = None
        self.color_theme_votes = {}
        self.current_canvas_color_theme = None
        self.current_drawing_theme = None
        self.drawings = []

    def update(self):
        current_time = time.time()
        if self.timer_end_time and current_time >= self.timer_end_time:
            if self.game_status == GameStatus.THEME_VOTING:
                self.start_drawing_phase()
            elif self.game_status == GameStatus.DRAWING:
                self.start_voting_phase()
            elif self.game_status == GameStatus.VOTING_FOR_DRAWINGS:
                self.start_showcase_phase()
            elif self.game_status == GameStatus.SHOWCASING_RESULTS:
                self.advance_showcase()
        
        if (self.game_status == GameStatus.WAITING_FOR_PLAYERS and 
            self.can_start_game()):
            self.start_theme_voting()
    
    def get_lobby_state(self):
        return {
            "id": self.lobby_id,
            "lobby_id": self.lobby_id,
            "host_id": self.host_id,
            "players": {
                p.player_id: {
                    "player_id": p.player_id, 
                    "display_name": p.display_name, 
                    "is_ready": p.is_ready, 
                    "is_host": (p.player_id == self.host_id),
                    "score": p.score, 
                    "has_submitted_drawing": p.drawing is not None
                } for p in self.players
            },
            "spectators": {
                p.player_id: {
                    "player_id": p.player_id,
                    "display_name": p.display_name,
                } for p in self.spectators
            },
            "settings": self.settings.to_dict(),
            "game_status": self.game_status.value,
            "max_players": self.max_players,
            "min_players": self.min_players,
            "timer_end_time": self.timer_end_time,
            "current_drawing_theme": self.current_drawing_theme,
            "current_canvas_color_theme": self.current_canvas_color_theme,
            "possible_color_themes": self.possible_color_themes if self.game_status == GameStatus.THEME_VOTING else [],
            "color_theme_votes": self.color_theme_votes if self.game_status == GameStatus.THEME_VOTING else {},
            "drawings_for_voting": [{"drawing_id": d.drawing_id, "player_id": d.player_id, "drawing_data": d.drawing_data, "drawing_theme": d.drawing_theme} for d in self.drawings] if self.game_status == GameStatus.VOTING_FOR_DRAWINGS else [],
            "results": [{"player_id": d.player_id, "drawing_id": d.drawing_id, "drawing_data": d.drawing_data, "votes": d.votes, "player_name": self.get_player(d.player_id).display_name if self.get_player(d.player_id) else "Unknown"} for d in self.drawings] if self.game_status in [GameStatus.SHOWCASING_RESULTS, GameStatus.ENDED] else [],
            "current_showcased_drawing": self.drawings[self.current_showcased_drawing_index].drawing_id if self.game_status == GameStatus.SHOWCASING_RESULTS and self.drawings and 0 <= self.current_showcased_drawing_index < len(self.drawings) else None,
        }

class LobbySettings:
    def __init__(self):
        self.max_players: int = 4
        self.min_players: int = 2
        self.theme_voting_time: int = 30
        self.drawing_time: int = GAME_DRAW_TIME_SECONDS
        self.voting_time: int = 60
        self.showcase_time_per_drawing: int = 10
        self.allow_spectators: bool = True
        self.private_lobby: bool = False
        self.lobby_password: Optional[str] = None
        self.custom_themes: list[str] = []
        self.enable_chat: bool = True
        self.auto_start_when_ready: bool = False
        self.winner_takes_all: bool = False

    def to_dict(self) -> dict:
        return {
            'max_players': self.max_players,
            'min_players': self.min_players,
            'theme_voting_time': self.theme_voting_time,
            'drawing_time': self.drawing_time,
            'voting_time': self.voting_time,
            'showcase_time_per_drawing': self.showcase_time_per_drawing,
            'allow_spectators': self.allow_spectators,
            'private_lobby': self.private_lobby,
            'has_password': self.lobby_password is not None,
            'custom_themes': self.custom_themes,
            'enable_chat': self.enable_chat,
            'auto_start_when_ready': self.auto_start_when_ready,
            'winner_takes_all': self.winner_takes_all        }
    
    def update_from_dict(self, settings_dict: dict) -> bool:
        changed = False
        for key, value in settings_dict.items():
            if hasattr(self, key) and getattr(self, key) != value:
                if key == 'max_players' and (value < 2 or value > 20):
                    continue
                if key == 'min_players' and (value < 2 or value > self.max_players):
                    continue
                if key in ['theme_voting_time', 'voting_time'] and (value < 10 or value > 300):
                    continue
                if key == 'drawing_time' and (value < 10 or value > MAX_DRAW_TIME_SECONDS):
                    continue
                if key == 'showcase_time_per_drawing' and (value < 3 or value > 30):
                    continue
                if key == 'custom_themes' and not isinstance(value, list):
                    continue
                setattr(self, key, value)
                changed = True
        return changed