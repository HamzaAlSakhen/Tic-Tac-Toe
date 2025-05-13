from flask import Flask, render_template, request, redirect, url_for
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
import uuid
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = os.urandom(24).hex()
socketio = SocketIO(app, cors_allowed_origins="*")
login_manager = LoginManager(app)
login_manager.login_view = 'login'

# Basit kullanıcı modeli
class User(UserMixin):
    def __init__(self, id, username):
        self.id = id
        self.username = username

# Kullanıcıları bellekte saklama
users = {}

# Aktif bağlantıları saklama
active_connections = {}

# Oyun odalarını ve durumlarını saklama
games = {}

# Bekleyen oyuncuları eşleştirme için oda
waiting_room = None

# Bekleyen davetler
pending_challenges = {}

@login_manager.user_loader
def load_user(user_id):
    return users.get(user_id)

@app.route('/')
def index():
    if current_user.is_authenticated:
        return render_template('index.html', username=current_user.username)
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        if not username:
            return render_template('index.html', error='Kullanıcı adı gerekli')
        
        user_id = str(uuid.uuid4())
        user = User(user_id, username)
        users[user_id] = user
        login_user(user)
        return redirect(url_for('index'))
    
    return render_template('index.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

# Oyun kazananını kontrol etme
def check_winner(board):
    # Kazanma kombinasyonları: yatay, dikey ve çapraz
    win_combinations = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],  # Yatay
        [0, 3, 6], [1, 4, 7], [2, 5, 8],  # Dikey
        [0, 4, 8], [2, 4, 6]              # Çapraz
    ]
    
    for combo in win_combinations:
        if board[combo[0]] and board[combo[0]] == board[combo[1]] == board[combo[2]]:
            return board[combo[0]], combo
    
    # Beraberlik kontrolü
    if "" not in board:
        return "draw", None
    
    return None, None

@socketio.on('connect')
def handle_connect():
    if not current_user.is_authenticated:
        return False
    
    # Kullanıcıyı aktif bağlantılara ekle
    socket_id = request.sid
    user_id = current_user.id
    
    active_connections[socket_id] = {
        'user_id': user_id,
        'username': current_user.username
    }
    
    print(f"Kullanıcı bağlandı: {current_user.username} (ID: {socket_id})")
    
    # Diğer kullanıcılara yeni kullanıcının katıldığını bildir
    emit('user_connected', {
        'user_id': user_id,
        'username': current_user.username
    }, broadcast=True, include_self=False)

@socketio.on('disconnect')
def handle_disconnect():
    global waiting_room
    
    socket_id = request.sid
    
    if socket_id not in active_connections:
        return
    
    user_data = active_connections[socket_id]
    user_id = user_data['user_id']
    
    # Kullanıcıyı aktif bağlantılardan kaldır
    del active_connections[socket_id]
    
    # Eğer bekleyen oyuncu bu ise, bekleme odasını temizle
    if waiting_room and waiting_room.get('players') and socket_id in waiting_room['players']:
        waiting_room = None
        return
    
    # Kullanıcının aktif olduğu oyunları bul
    for room_id, game in list(games.items()):
        if socket_id in game['players']:
            # Diğer oyuncuyu bul
            opponent_idx = 1 if game['players'][0] == socket_id else 0
            if len(game['players']) > opponent_idx:
                opponent_id = game['players'][opponent_idx]
                
                # Diğer oyuncuya bildir
                emit('game_over', {
                    'winner': 'disconnect', 
                    'message': 'Rakip bağlantısı kesildi',
                    'board': game['board']
                }, room=opponent_id)
            
            # Oyunu temizle
            del games[room_id]
            break
    
    # Diğer kullanıcılara kullanıcının ayrıldığını bildir
    emit('user_disconnected', {
        'user_id': user_id
    }, broadcast=True)

@socketio.on('get_available_players')
def handle_get_players():
    players = []
    
    for sid, data in active_connections.items():
        players.append({
            'id': sid,
            'user_id': data['user_id'],
            'username': data['username']
        })
    
    emit('available_players', {'players': players})

@socketio.on('challenge_player')
def handle_challenge_player(data):
    target_player_id = data.get('player_id')
    
    if not target_player_id or target_player_id not in active_connections:
        emit('challenge_error', {'message': 'Oyuncu bulunamadı'})
        return
    
    challenger_id = request.sid
    challenger_data = active_connections[challenger_id]
    
    # Daveti oluştur
    challenge_id = str(uuid.uuid4())
    pending_challenges[challenge_id] = {
        'challenger_id': challenger_id,
        'challenger_name': challenger_data['username'],
        'target_id': target_player_id,
        'target_name': active_connections[target_player_id]['username']
    }
    
    # Hedef oyuncuya daveti bildir
    emit('game_challenge', {
        'challenge_id': challenge_id,
        'from_username': challenger_data['username'],
        'from_id': challenger_id
    }, room=target_player_id)
    
    # Davet gönderene bilgi ver
    emit('challenge_sent', {
        'challenge_id': challenge_id,
        'to_username': active_connections[target_player_id]['username']
    })

@socketio.on('accept_challenge')
def handle_accept_challenge(data):
    challenge_id = data.get('challenge_id')
    
    if not challenge_id or challenge_id not in pending_challenges:
        emit('challenge_error', {'message': 'Davet bulunamadı veya süresi dolmuş'})
        return
    
    challenge = pending_challenges[challenge_id]
    challenger_id = challenge['challenger_id']
    target_id = challenge['target_id']
    
    # Yeni oda oluştur
    room_id = str(uuid.uuid4())
    
    # Oyun oluştur
    games[room_id] = {
        "room_id": room_id,
        "board": ["", "", "", "", "", "", "", "", ""],
        "turn": "X",
        "players": [challenger_id, target_id]
    }
    
    # Kullanıcıları odaya kat
    join_room(room_id, sid=challenger_id)
    join_room(room_id, sid=target_id)
    
    # Kullanıcılara rollerini ver
    emit('game_start', {'room': room_id, 'symbol': 'X'}, room=challenger_id)
    emit('game_start', {'room': room_id, 'symbol': 'O'}, room=target_id)
    
    # Tüm oyunculara oyunun başladığını bildir
    emit('game_ready', {'room': room_id}, room=room_id)
    emit('state', {'board': games[room_id]["board"], 'turn': games[room_id]["turn"]}, room=room_id)
    
    # Daveti temizle
    del pending_challenges[challenge_id]

@socketio.on('reject_challenge')
def handle_reject_challenge(data):
    challenge_id = data.get('challenge_id')
    
    if not challenge_id or challenge_id not in pending_challenges:
        return
    
    challenge = pending_challenges[challenge_id]
    
    # Davet edene reddetme bilgisi gönder
    emit('challenge_rejected', {
        'challenge_id': challenge_id,
        'by_username': challenge['target_name']
    }, room=challenge['challenger_id'])
    
    # Daveti temizle
    del pending_challenges[challenge_id]

@socketio.on('find_game')
def handle_find_game():
    global waiting_room
    
    user_id = request.sid
    
    # Eğer bekleyen oda yoksa yeni oda oluştur
    if waiting_room is None:
        room_id = str(uuid.uuid4())
        waiting_room = {
            "room_id": room_id,
            "board": ["", "", "", "", "", "", "", "", ""],
            "turn": "X",
            "players": [user_id]
        }
        
        # Kullanıcıyı odaya kat
        join_room(room_id)
        
        # Kullanıcıya X rolünü ver
        emit('game_start', {'room': room_id, 'symbol': 'X'})
        
    else:
        # Bekleyen odaya ikinci oyuncu olarak katıl
        room_id = waiting_room["room_id"]
        waiting_room["players"].append(user_id)
        
        # Oyunu aktif oyunlar listesine ekle
        games[room_id] = waiting_room
        
        # Kullanıcıyı odaya kat
        join_room(room_id)
        
        # Kullanıcıya O rolünü ver
        emit('game_start', {'room': room_id, 'symbol': 'O'})
        
        # Tüm oyunculara oyunun başladığını bildir
        emit('game_ready', {'room': room_id}, room=room_id)
        emit('state', {'board': waiting_room["board"], 'turn': waiting_room["turn"]}, room=room_id)
        
        # Bekleme odasını temizle
        waiting_room = None

@socketio.on('move')
def handle_move(data):
    room_id = data.get('room')
    index = data.get('index')
    
    # Geçerli oda ve hamle kontrolü
    if not room_id or room_id not in games or index is None:
        return
    
    game = games[room_id]
    user_id = request.sid
    
    # Oyuncunun sırası mı kontrol et
    player_idx = game['players'].index(user_id) if user_id in game['players'] else -1
    current_symbol = 'X' if player_idx == 0 else 'O'
    
    # Sıra bu oyuncuda değilse veya hücre doluysa hamleyi reddet
    if game['turn'] != current_symbol or player_idx == -1 or game['board'][index] != "":
        return
    
    # Hamleyi uygula
    game['board'][index] = current_symbol
    
    # Sırayı değiştir
    game['turn'] = 'O' if current_symbol == 'X' else 'X'
    
    # Kazanan kontrolü
    winner, win_line = check_winner(game['board'])
    
    if winner:
        if winner == "draw":
            emit('game_over', {
                'winner': 'draw', 
                'message': 'Berabere!',
                'board': game['board']
            }, room=room_id)
        else:
            emit('game_over', {
                'winner': winner, 
                'line': win_line,
                'message': f'{winner} kazandı!',
                'board': game['board']
            }, room=room_id)
        
        # Oyunu temizle
        del games[room_id]
    else:
        # Güncel durumu odaya bildir
        emit('state', {'board': game['board'], 'turn': game['turn']}, room=room_id)

if __name__ == '__main__':
    socketio.run(app, host="0.0.0.0", port=5000, debug=True) 