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
        self.votes_cast_on_drawing = None
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
        self.drawing_vote_counts = {}
        self.winners = []
    
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
        self.drawing_vote_counts = {player_id: 0 for player_id in self.players.keys()}
        for player in self.players.values():
            player.drawing = None
            player.votes_cast_on_drawing = None
        self.game_timer_start_time = time.time()
        self.phase_duration = 120
        print(f"Lobby {self.lobby_id}: Drawing phase started! Theme: '{self.current_drawing_theme}'. Color Palette: '{self.chosen_color_theme}'. Time: {self.phase_duration}s.")

    def submit_drawing(self, player_id, drawing_data):
        if self.game_state != GameStatus.DRAWING:
            print(f"Lobby {self.lobby_id}: Cannot submit drawing, not in drawing phase.")
            return False
        if player_id not in self.players:
            print(f"Lobby {self.lobby_id}: Player {player_id} not in lobby.")
            return False
        if self.drawings_submitted.get(player_id) is not None:
            print(f"Lobby {self.lobby_id}: Player {self.players[player_id].name} has already submitted a drawing.")
            return False

        drawing = Drawing(player_id, drawing_data, self.current_drawing_theme)
        self.drawings_submitted[player_id] = drawing
        self.players[player_id].drawing = drawing
        print(f"Lobby {self.lobby_id}: Player {self.players[player_id].name} submitted their drawing for '{self.current_drawing_theme}'.")
        if all(sub is not None for sub in self.drawings_submitted.values()):
            print(f"Lobby {self.lobby_id}: All players have submitted drawings.")
            self.start_drawing_voting_phase()
        return True
    
    def start_drawing_voting_phase(self):
        if self.game_state != GameStatus.DRAWING:
            pass
        self.valid_drawings_for_voting = {pid: d for pid, d in self.drawings_submitted.items() if d is not None}
        if not self.valid_drawings_for_voting or len(self.valid_drawings_for_voting) < 1:
            print(f"Lobby {self.lobby_id}: Not enough drawings submitted to start voting. Ending game.")
            self.end_game_early()
            return
        self.game_state = GameStatus.VOTING_FOR_DRAWINGS
        self.game_timer_start_time = time.time()
        self.phase_duration = 60
        for player in self.players.values():
            player.votes_cast_on_drawing = None
        self.drawing_vote_counts = {pid: 0 for pid in self.valid_drawings_for_voting.keys()}
        print(f"Lobby {self.lobby_id}: Drawing voting phase started. Players can now vote. Time: {self.phase_duration}s.")

    def cast_drawing_vote(self, voter_player_id, drawing_owner_player_id):
        if self.game_state != GameStatus.VOTING_FOR_DRAWINGS:
            print(f"Lobby {self.lobby_id}: Cannot vote for drawing, not in drawing voting state.")
            return False
        if voter_player_id not in self.players:
            print(f"Lobby {self.lobby_id}: Voter {voter_player_id} not in lobby.")
            return False
        if drawing_owner_player_id not in self.valid_drawings_for_voting:
            print(f"Lobby {self.lobby_id}: Drawing by {drawing_owner_player_id} is not available for voting or player does not exist.")
            return False
        if voter_player_id == drawing_owner_player_id:
            print(f"Lobby {self.lobby_id}: Player {self.players[voter_player_id].name} cannot vote for their own drawing.")
            return False
        
        voter = self.players[voter_player_id]
        if voter.votes_cast_on_drawing is not None:
            print(f"Lobby {self.lobby_id}: Player {voter.name} has already voted for a drawing.")
            return False
        self.drawing_vote_counts[drawing_owner_player_id] = self.drawing_vote_counts.get(drawing_owner_player_id, 0) + 1
        voter.votes_cast_on_drawing = drawing_owner_player_id
        print(f"Lobby {self.lobby_id}: Player {voter.name} voted for {self.players[drawing_owner_player_id].name}'s drawing.")
        if all(p.votes_cast_on_drawing is not None or p.player_id not in self.valid_drawings_for_voting for p_id, p in self.players.items()):
            votes_made = sum(1 for p in self.players.values() if p.votes_cast_on_drawing is not None)
            if votes_made == len(self.players) or len(self.valid_drawings_for_voting) <=1 :
                 print(f"Lobby {self.lobby_id}: All players have voted for drawings.")
                 self.end_drawing_voting_phase()
        return True
    
    def end_drawing_voting_phase(self):
        if self.game_state != GameStatus.VOTING_FOR_DRAWINGS:
            return

        print(f"Lobby {self.lobby_id}: Drawing voting phase ended. Calculating results...")
        self.calculate_results_and_showcase()

    def calculate_results_and_showcase(self):
        self.game_state = GameStatus.SHOWCASING_RESULTS
        sorted_drawers = sorted(self.drawing_vote_counts.items(), key=lambda item: item[1], reverse=True)
        
        self.winners = []
        prizes = {0: "1st Prize", 1: "2nd Prize", 2: "3rd Prize"}
        
        print(f"\n--- Lobby {self.lobby_id}: Results ---")
        if not sorted_drawers:
            print("No drawings were voted on.")
        else:
            for i, (player_id, votes) in enumerate(sorted_drawers):
                player_name = self.players[player_id].name if player_id in self.players else "Unknown Player"
                score_awarded = 0
                if i == 0: score_awarded = 100
                elif i == 1: score_awarded = 50
                elif i == 2: score_awarded = 25
                
                if player_id in self.players:
                    self.players[player_id].score += score_awarded
                
                prize_str = prizes.get(i, f"{i+1}th place")
                print(f"{prize_str}: {player_name} with {votes} votes. (Awarded {score_awarded} points)")
                if i < 3:
                    self.winners.append({"player_id": player_id, "name": player_name, "votes": votes, "rank": i + 1})
        self.game_timer_start_time = time.time()
        self.phase_duration = 15 * len(self.valid_drawings_for_voting)
        if not self.valid_drawings_for_voting: 
            self.phase_duration = 10
        
        print(f"Lobby {self.lobby_id}: Showcasing results. Duration: {self.phase_duration}s")

    def end_game(self):
        self.game_state = GameStatus.ENDED
        print(f"Lobby {self.lobby_id} (Game ID: {self.current_game_id}): Game has ended.")
        print("Final Scores:")
        for player_id, player in self.players.items():
            print(f"- {player.name}: {player.score} points")

    def end_game_early(self):
        print(f"Lobby {self.lobby_id} (Game ID: {self.current_game_id}): Game ending early due to lack of participation/drawings.")
        self.game_state = GameStatus.ENDED

    def update_lobby_state(self):
        if not self.players and self.game_state not in [GameStatus.WAITING_FOR_PLAYERS, GameStatus.ENDED]:
            print(f"Lobby {self.lobby_id}: All players left mid-game. Ending game.")
            self.end_game_early()
            return
        current_time = time.time()
        if self.game_timer_start_time > 0 and self.phase_duration > 0:
            time_elapsed = current_time - self.game_timer_start_time
            if time_elapsed >= self.phase_duration:
                if self.game_state == GameStatus.VOTING_FOR_THEME:
                    print(f"Lobby {self.lobby_id}: Color theme voting time up.")
                    self.end_color_theme_voting()
                elif self.game_state == GameStatus.DRAWING:
                    print(f"Lobby {self.lobby_id}: Drawing time up.")
                    self.start_drawing_voting_phase()
                elif self.game_state == GameStatus.VOTING_FOR_DRAWINGS:
                    print(f"Lobby {self.lobby_id}: Drawing voting time up.")
                    self.end_drawing_voting_phase()
                elif self.game_state == GameStatus.SHOWCASING_RESULTS:
                    print(f"Lobby {self.lobby_id}: Results showcase time up.")
                    self.end_game()
                self.game_timer_start_time = 0 
                self.phase_duration = 0

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
        self.valid_drawings_for_voting = {}
        for player in self.players.values():
            player.is_ready = False
            player.drawing = None
            player.votes_cast = {}
            player.score = 0
            player.voted_color_theme = None
            player.votes_cast_on_drawing = None
    
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