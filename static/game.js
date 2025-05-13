document.addEventListener('DOMContentLoaded', () => {
   // DOM elementleri
   const findGameBtn = document.getElementById('find-game');
   const gameBoard = document.getElementById('game-board');
   const gameStatus = document.getElementById('game-status');
   const gameResult = document.getElementById('game-result');
   const statusText = document.getElementById('status-text');
   const playerSymbol = document.getElementById('player-symbol');
   const turnInfo = document.getElementById('turn-info');
   const resultMessage = document.getElementById('result-message');
   const playAgainBtn = document.getElementById('play-again');
   const cells = document.querySelectorAll('.cell');
   const playersList = document.getElementById('players-list');
   const notificationsContainer = document.getElementById('notifications');
   const leftPanel = document.querySelector('.left-panel');
   const rightPanel = document.querySelector('.right-panel');
   const gameContainer = document.querySelector('.game-container');

   // Oyun durumu
   let currentRoom = null;
   let mySymbol = null;
   let scores = { wins: 0, losses: 0, draws: 0 };
   let gameActive = false;

   // Socket.IO bağlantısı
   const socket = io();

   // Bağlantı olayları
   socket.on('connect', () => {
      console.log('Sunucuya bağlandı');
   });

   socket.on('disconnect', () => {
      console.log('Sunucu bağlantısı kesildi');
      resetGame();
      statusText.textContent = 'Sunucu bağlantısı kesildi!';
      showPlayersList();
      gameActive = false;
   });

   // Oyun olayları
   socket.on('game_start', (data) => {
      currentRoom = data.room;
      mySymbol = data.symbol;
      playerSymbol.textContent = mySymbol;

      gameStatus.classList.remove('hidden');
      statusText.textContent = 'Rakip bekleniyor...';
   });

   socket.on('game_ready', (data) => {
      gameBoard.classList.remove('hidden');
      statusText.textContent = 'Oyun başladı!';

      // Oyun başladığında sadece oyun tahtasını göster
      hidePlayersList();
      gameActive = true;
   });

   socket.on('state', (data) => {
      updateBoard(data.board);
      updateTurn(data.turn);
   });

   socket.on('game_over', (data) => {
      // Son hamleyi göster, sonra oyun sonucu panelini göster
      updateBoard(data.board);
      gameActive = false;

      // Kısa bir gecikme ile sonuç panelini göster
      setTimeout(() => {
         gameResult.classList.remove('hidden');

         if (data.winner === 'draw') {
            resultMessage.textContent = 'Berabere!';
            scores.draws++;
         } else if (data.winner === 'disconnect') {
            resultMessage.textContent = 'Rakip oyundan ayrıldı! Kazandınız!';
            scores.wins++;
         } else {
            const winnerText = data.winner === mySymbol ? 'Kazandınız!' : 'Kaybettiniz!';
            resultMessage.textContent = `${data.winner} ${winnerText}`;

            if (data.winner === mySymbol) {
               scores.wins++;
            } else {
               scores.losses++;
            }

            // Kazanan çizgiyi vurgula
            if (data.line) {
               data.line.forEach(index => {
                  cells[index].classList.add('winner');
               });
            }
         }

         // Skor güncelleme
         updateScores();

         // Oyun bittiğinde oyuncu listesini tekrar göster
         showPlayersList();

         // Oyuncu listesini güncelle
         socket.emit('get_available_players');
      }, 300);
   });

   // Mevcut oyuncuları listele
   socket.on('available_players', (data) => {
      updatePlayersList(data.players);
   });

   // Kullanıcı bağlantı olayları
   socket.on('user_connected', (data) => {
      showNotification(`${data.username} oyuna katıldı.`);
      socket.emit('get_available_players');
   });

   socket.on('user_disconnected', (data) => {
      socket.emit('get_available_players');
   });

   // Davet olayları
   socket.on('game_challenge', (data) => {
      // Eğer aktif oyun varsa daveti gösterme
      if (gameActive) {
         socket.emit('reject_challenge', { challenge_id: data.challenge_id });
         return;
      }

      const { challenge_id, from_username } = data;

      // Davet bildirimi oluştur
      const notification = document.createElement('div');
      notification.className = 'notification challenge';
      notification.innerHTML = `
         <p><strong>${from_username}</strong> sizi oyuna davet ediyor!</p>
         <div class="notification-actions">
            <button class="btn btn-primary btn-small accept-btn">Kabul Et</button>
            <button class="btn btn-secondary btn-small reject-btn">Reddet</button>
         </div>
      `;

      // Kabul ve red butonları için olay dinleyicileri
      notification.querySelector('.accept-btn').addEventListener('click', () => {
         socket.emit('accept_challenge', { challenge_id });
         notification.remove();
      });

      notification.querySelector('.reject-btn').addEventListener('click', () => {
         socket.emit('reject_challenge', { challenge_id });
         notification.remove();
      });

      // Bildirimi ekle
      notificationsContainer.appendChild(notification);

      // 30 saniye sonra otomatik olarak kaldır
      setTimeout(() => {
         if (notification.parentNode) {
            notification.remove();
         }
      }, 30000);
   });

   socket.on('challenge_sent', (data) => {
      showNotification(`Davet gönderildi: ${data.to_username}`);
   });

   socket.on('challenge_rejected', (data) => {
      showNotification(`${data.by_username} davetinizi reddetti.`);
   });

   socket.on('challenge_error', (data) => {
      showNotification(`Hata: ${data.message}`, 'error');
   });

   // Oyun arama
   findGameBtn.addEventListener('click', () => {
      findGameBtn.disabled = true;
      findGameBtn.textContent = 'Oyun aranıyor...';
      statusText.textContent = 'Eşleşme bekleniyor...';
      gameStatus.classList.remove('hidden');

      socket.emit('find_game');
   });

   // Hücre tıklama
   cells.forEach(cell => {
      cell.addEventListener('click', () => {
         if (!currentRoom || cell.textContent || mySymbol !== turnInfo.textContent) {
            return; // Geçersiz hamle
         }

         const index = parseInt(cell.dataset.idx);
         socket.emit('move', { room: currentRoom, index: index });
      });
   });

   // Tekrar oynama
   playAgainBtn.addEventListener('click', () => {
      resetGame();
      findGameBtn.disabled = false;
      findGameBtn.textContent = 'Rastgele Oyun Ara';
      showPlayersList();
      gameActive = false;
   });

   // Tahta güncelleme
   function updateBoard(board) {
      if (!board) return;

      cells.forEach((cell, index) => {
         const value = board[index];
         cell.textContent = value;

         // Sınıfları temizle
         cell.classList.remove('x', 'o');

         // Sembol sınıfını ekle
         if (value === 'X') {
            cell.classList.add('x');
         } else if (value === 'O') {
            cell.classList.add('o');
         }
      });
   }

   // Sıra güncelleme
   function updateTurn(turn) {
      turnInfo.textContent = turn;

      if (turn === mySymbol) {
         statusText.textContent = 'Sıra sizde!';
      } else {
         statusText.textContent = 'Rakibin hamlesi bekleniyor...';
      }
   }

   // Skor güncelleme
   function updateScores() {
      const scoreElement = document.getElementById('player-score');
      if (scoreElement) {
         scoreElement.textContent = `Kazanma: ${scores.wins} | Kaybetme: ${scores.losses} | Berabere: ${scores.draws}`;
      }
   }

   // Oyuncu listesini güncelleme
   function updatePlayersList(players) {
      const playersList = document.getElementById('players-list');
      if (!playersList) return;

      playersList.innerHTML = '';

      if (!players || players.length === 0) {
         const noPlayerItem = document.createElement('li');
         noPlayerItem.textContent = 'Aktif oyuncu yok';
         playersList.appendChild(noPlayerItem);
         return;
      }

      players.forEach(player => {
         if (player.id === socket.id) return; // Kendimizi listeden çıkar

         const playerItem = document.createElement('li');
         playerItem.className = 'player-item';

         const playerName = document.createElement('span');
         playerName.textContent = player.username;

         const challengeBtn = document.createElement('button');
         challengeBtn.textContent = 'Davet Et';
         challengeBtn.className = 'btn btn-small btn-primary';
         challengeBtn.addEventListener('click', () => {
            if (gameActive) {
               showNotification('Aktif oyun devam ederken davet gönderemezsiniz.', 'error');
               return;
            }

            socket.emit('challenge_player', { player_id: player.id });
            challengeBtn.disabled = true;
            challengeBtn.textContent = 'Davet gönderildi...';

            // 5 saniye sonra butonu sıfırla
            setTimeout(() => {
               challengeBtn.disabled = false;
               challengeBtn.textContent = 'Davet Et';
            }, 5000);
         });

         playerItem.appendChild(playerName);
         playerItem.appendChild(challengeBtn);
         playersList.appendChild(playerItem);
      });
   }

   // Bildirimleri gösterme
   function showNotification(message, type = 'info') {
      const notification = document.createElement('div');
      notification.className = `notification ${type}`;
      notification.textContent = message;

      notificationsContainer.appendChild(notification);

      // 5 saniye sonra otomatik olarak kaldır
      setTimeout(() => {
         notification.classList.add('fade-out');
         setTimeout(() => {
            notification.remove();
         }, 500);
      }, 5000);
   }

   // Oyuncu listesini gizle ve oyun tahtasını tam ekran göster
   function hidePlayersList() {
      if (leftPanel) {
         leftPanel.classList.add('hidden');
      }

      if (rightPanel) {
         rightPanel.classList.add('fullscreen');
      }

      if (gameContainer) {
         gameContainer.classList.add('game-active');
      }
   }

   // Oyuncu listesini tekrar göster
   function showPlayersList() {
      if (leftPanel) {
         leftPanel.classList.remove('hidden');
      }

      if (rightPanel) {
         rightPanel.classList.remove('fullscreen');
      }

      if (gameContainer) {
         gameContainer.classList.remove('game-active');
      }
   }

   // Oyunu sıfırla
   function resetGame() {
      currentRoom = null;
      mySymbol = null;

      // UI sıfırlama
      cells.forEach(cell => {
         cell.textContent = '';
         cell.classList.remove('x', 'o', 'winner');
      });

      playerSymbol.textContent = '-';
      turnInfo.textContent = '-';

      gameBoard.classList.add('hidden');
      gameResult.classList.add('hidden');
   }

   // Başlangıçta oyuncu listesini talep et
   socket.emit('get_available_players');

   // Düzenli olarak oyuncu listesini güncelle
   setInterval(() => {
      if (!gameActive) {
         socket.emit('get_available_players');
      }
   }, 5000);
}); 