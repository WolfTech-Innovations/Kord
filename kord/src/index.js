// import l10n.js first
import 'kaios-gaia-l10n';
import './index.css';

window.addEventListener('load', () => {
  const anchor = document.getElementById('app-link');
  anchor.focus();
});

// Main application
const DiscordKaiOS = {
  currentView: 'serverList',
  selectedIndex: 0,
  servers: [],
  channels: {},
  currentMessages: [],
  currentServer: null,
  currentChannel: null,
  user: null,
  token: null,
  apiBase: 'https://discord.com/api/v10',
  
  // Initialize the application
  init: function() {
    console.log('Initializing Kord for KaiOS...');
    this.setupEventListeners();
    this.loadStoredCredentials();
    this.renderLoginScreen();
  },
  
  // Set up key navigation handlers
  setupEventListeners: function() {
    document.addEventListener('keydown', (e) => {
      switch(e.key) {
        case 'ArrowUp':
          this.navigate(-1);
          break;
        case 'ArrowDown':
          this.navigate(1);
          break;
        case 'Enter':
          this.select();
          break;
        case 'SoftLeft':
          this.softLeftAction();
          break;
        case 'SoftRight':
          this.softRightAction();
          break;
        case 'Backspace':
          this.back();
          break;
      }
    });
  },
  
  // Handle navigation between UI elements
  navigate: function(direction) {
    const maxIndex = this.getMaxIndexForCurrentView();
    this.selectedIndex = Math.max(0, Math.min(maxIndex, this.selectedIndex + direction));
    this.updateSelection();
  },
  
  // Get maximum selectable index based on current view
  getMaxIndexForCurrentView: function() {
    switch(this.currentView) {
      case 'serverList':
        return this.servers.length - 1;
      case 'channelList':
        return this.channels[this.currentServer].length - 1;
      case 'messageList':
        return this.currentMessages.length - 1;
      default:
        return 0;
    }
  },
  
  // Update UI to reflect current selection
  updateSelection: function() {
    const elements = document.querySelectorAll('.selectable');
    elements.forEach((el, i) => {
      if (i === this.selectedIndex) {
        el.classList.add('selected');
        el.scrollIntoView({ block: 'nearest' });
      } else {
        el.classList.remove('selected');
      }
    });
  },
  
  // Handle selection of current item
  select: function() {
    switch(this.currentView) {
      case 'serverList':
        this.currentServer = this.servers[this.selectedIndex].id;
        this.loadChannels(this.currentServer);
        this.currentView = 'channelList';
        this.selectedIndex = 0;
        this.renderChannelList();
        break;
      case 'channelList':
        this.currentChannel = this.channels[this.currentServer][this.selectedIndex].id;
        this.loadMessages(this.currentChannel);
        this.currentView = 'messageList';
        this.selectedIndex = 0;
        this.renderMessageList();
        break;
      case 'messageList':
        // Show options for the selected message
        this.showMessageOptions(this.currentMessages[this.selectedIndex]);
        break;
    }
  },
  
  // Handle soft left button action (context dependent)
  softLeftAction: function() {
    switch(this.currentView) {
      case 'serverList':
        this.showUserProfile();
        break;
      case 'channelList':
        this.showServerInfo();
        break;
      case 'messageList':
        this.showNewMessageForm();
        break;
    }
  },
  
  // Handle soft right button action (context dependent)
  softRightAction: function() {
    switch(this.currentView) {
      case 'serverList':
        this.showOptions();
        break;
      case 'channelList':
        this.showSearch();
        break;
      case 'messageList':
        this.toggleReactions();
        break;
    }
  },
  
  // Handle back button
  back: function() {
    switch(this.currentView) {
      case 'channelList':
        this.currentView = 'serverList';
        this.selectedIndex = this.servers.findIndex(s => s.id === this.currentServer);
        this.renderServerList();
        break;
      case 'messageList':
        this.currentView = 'channelList';
        this.selectedIndex = this.channels[this.currentServer].findIndex(c => c.id === this.currentChannel);
        this.renderChannelList();
        break;
      default:
        // If on main screen, ask if user wants to quit
        if (this.currentView === 'serverList') {
          if (confirm('Exit Kord?')) {
            window.close();
          }
        }
    }
  },
  
  // Load user credentials from device storage
  loadStoredCredentials: function() {
    const storedToken = localStorage.getItem('discord-token');
    if (storedToken) {
      this.token = storedToken;
      this.loadUserData();
    }
  },
  
  // Render login screen
  renderLoginScreen: function() {
    if (this.token) {
      this.loadServers();
      return;
    }
    
    const container = document.getElementById('app');
    container.innerHTML = `
      <div class="login-screen">
        <div class="logo">Kord</div>
        <form id="login-form">
          <input type="email" id="email" placeholder="Email" class="selectable selected" />
          <input type="password" id="password" placeholder="Password" class="selectable" />
          <button type="submit" class="selectable">Log In</button>
        </form>
        <div class="footer">
          <div class="soft-key">Profile</div>
          <div class="soft-key">Select</div>
          <div class="soft-key">Options</div>
        </div>
      </div>
    `;
    
    document.getElementById('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.login();
    });
  },
  
  // Handle login process
  login: async function() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    try {
      const response = await fetch(`${this.apiBase}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: email,
          password: password
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        this.token = data.token;
        localStorage.setItem('discord-token', this.token);
        this.loadUserData();
      } else {
        alert('Login failed. Please check your credentials.');
      }
    } catch (error) {
      console.error('Login error:', error);
      alert('Network error. Please try again.');
    }
  },
  
  // Load user profile data
  loadUserData: async function() {
    try {
      const response = await fetch(`${this.apiBase}/users/@me`, {
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      });
      
      if (response.ok) {
        this.user = await response.json();
        this.loadServers();
      } else {
        // Token likely expired
        localStorage.removeItem('discord-token');
        this.token = null;
        this.renderLoginScreen();
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  },
  
  // Load server list
  loadServers: async function() {
    try {
      const response = await fetch(`${this.apiBase}/users/@me/guilds`, {
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      });
      
      if (response.ok) {
        this.servers = await response.json();
        this.renderServerList();
      } else {
        alert('Failed to load servers.');
      }
    } catch (error) {
      console.error('Error loading servers:', error);
    }
  },
  
  // Render server list view
  renderServerList: function() {
    const container = document.getElementById('app');
    
    let serverListHTML = this.servers.map((server, index) => {
      const isSelected = index === this.selectedIndex ? 'selected' : '';
      return `<div class="server-item selectable ${isSelected}">
        <div class="server-icon">${server.icon ? `<img src="${server.icon}" alt="${server.name}" />` : server.name.charAt(0)}</div>
        <div class="server-name">${server.name}</div>
      </div>`;
    }).join('');
    
    container.innerHTML = `
      <div class="server-list-view">
        <div class="header">Servers</div>
        <div class="server-list">
          ${serverListHTML}
        </div>
        <div class="footer">
          <div class="soft-key">Profile</div>
          <div class="soft-key">Select</div>
          <div class="soft-key">Options</div>
        </div>
      </div>
    `;
  },
  
  // Load channels for a server
  loadChannels: async function(serverId) {
    try {
      const response = await fetch(`${this.apiBase}/guilds/${serverId}/channels`, {
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      });
      
      if (response.ok) {
        // Filter to only text channels
        const allChannels = await response.json();
        this.channels[serverId] = allChannels.filter(channel => channel.type === 0);
      } else {
        alert('Failed to load channels.');
      }
    } catch (error) {
      console.error('Error loading channels:', error);
    }
  },
  
  // Render channel list view
  renderChannelList: function() {
    const container = document.getElementById('app');
    const server = this.servers.find(s => s.id === this.currentServer);
    
    let channelListHTML = this.channels[this.currentServer].map((channel, index) => {
      const isSelected = index === this.selectedIndex ? 'selected' : '';
      return `<div class="channel-item selectable ${isSelected}">
        <div class="channel-icon">#</div>
        <div class="channel-name">${channel.name}</div>
      </div>`;
    }).join('');
    
    container.innerHTML = `
      <div class="channel-list-view">
        <div class="header">${server.name}</div>
        <div class="channel-list">
          ${channelListHTML}
        </div>
        <div class="footer">
          <div class="soft-key">Info</div>
          <div class="soft-key">Select</div>
          <div class="soft-key">Search</div>
        </div>
      </div>
    `;
  },
  
  // Load messages for a channel
  loadMessages: async function(channelId) {
    try {
      const response = await fetch(`${this.apiBase}/channels/${channelId}/messages?limit=25`, {
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      });
      
      if (response.ok) {
        this.currentMessages = await response.json();
      } else {
        alert('Failed to load messages.');
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  },
  
  // Render message list view
  renderMessageList: function() {
    const container = document.getElementById('app');
    const channel = this.channels[this.currentServer].find(c => c.id === this.currentChannel);
    
    let messageListHTML = this.currentMessages.map((message, index) => {
      const isSelected = index === this.selectedIndex ? 'selected' : '';
      const formattedTime = new Date(message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      
      return `<div class="message-item selectable ${isSelected}">
        <div class="message-header">
          <span class="author">${message.author.username}</span>
          <span class="timestamp">${formattedTime}</span>
        </div>
        <div class="message-content">${this.formatMessageContent(message.content)}</div>
      </div>`;
    }).join('');
    
    container.innerHTML = `
      <div class="message-list-view">
        <div class="header">#${channel.name}</div>
        <div class="message-list">
          ${messageListHTML}
        </div>
        <div class="footer">
          <div class="soft-key">New</div>
          <div class="soft-key">Options</div>
          <div class="soft-key">React</div>
        </div>
      </div>
    `;
  },
  
  // Format message content with basic markdown support
  formatMessageContent: function(content) {
    // Basic markdown formatting
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')  // Bold
      .replace(/\*(.*?)\*/g, '<em>$1</em>')              // Italic
      .replace(/~~(.*?)~~/g, '<del>$1</del>')            // Strikethrough
      .replace(/```([\s\S]*?)```/g, '<pre>$1</pre>')      // Code block
      .replace(/`([^`]+)`/g, '<code>$1</code>');         // Inline code
  },
  
  // Show new message input form
  showNewMessageForm: function() {
    const currentView = document.querySelector('.message-list-view');
    if (!currentView) return;
    
    const messageForm = document.createElement('div');
    messageForm.className = 'message-form';
    messageForm.innerHTML = `
      <input type="text" id="message-input" placeholder="Type a message..." />
      <div class="button-row">
        <button id="send-button">Send</button>
        <button id="cancel-button">Cancel</button>
      </div>
    `;
    
    currentView.appendChild(messageForm);
    document.getElementById('message-input').focus();
    
    document.getElementById('send-button').addEventListener('click', () => {
      this.sendMessage();
      messageForm.remove();
    });
    
    document.getElementById('cancel-button').addEventListener('click', () => {
      messageForm.remove();
    });
  },
  
  // Send a new message
  sendMessage: async function() {
    const content = document.getElementById('message-input').value;
    if (!content.trim()) return;
    
    try {
      const response = await fetch(`${this.apiBase}/channels/${this.currentChannel}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: content
        })
      });
      
      if (response.ok) {
        // Add message to current list and re-render
        const newMessage = await response.json();
        this.currentMessages.unshift(newMessage);
        this.renderMessageList();
      } else {
        alert('Failed to send message.');
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  },
  
  // Show user profile screen
  showUserProfile: function() {
    if (!this.user) return;
    
    const container = document.getElementById('app');
    container.innerHTML = `
      <div class="profile-view">
        <div class="header">Your Profile</div>
        <div class="profile-content">
          <div class="avatar">
            ${this.user.avatar ? `<img src="${this.user.avatar}" alt="Avatar" />` : this.user.username.charAt(0)}
          </div>
          <div class="username">${this.user.username}</div>
          <div class="discriminator">#${this.user.discriminator}</div>
          <div class="status-selector">
            <div class="status-item selectable selected">Online</div>
            <div class="status-item selectable">Idle</div>
            <div class="status-item selectable">Do Not Disturb</div>
            <div class="status-item selectable">Invisible</div>
          </div>
        </div>
        <div class="footer">
          <div class="soft-key">Back</div>
          <div class="soft-key">Select</div>
          <div class="soft-key">Logout</div>
        </div>
      </div>
    `;
    
    // Add event listener for back button
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' || e.key === 'SoftLeft') {
        this.renderServerList();
      } else if (e.key === 'SoftRight') {
        this.logout();
      }
    }, { once: true });
  },
  
  // Show server information
  showServerInfo: function() {
    if (!this.currentServer) return;
    
    const server = this.servers.find(s => s.id === this.currentServer);
    const container = document.getElementById('app');
    
    container.innerHTML = `
      <div class="server-info-view">
        <div class="header">Server Info</div>
        <div class="server-info-content">
          <div class="server-icon">
            ${server.icon ? `<img src="${server.icon}" alt="${server.name}" />` : server.name.charAt(0)}
          </div>
          <div class="server-name">${server.name}</div>
          <div class="server-details">
            <div class="detail">
              <span class="label">Owner:</span>
              <span class="value">${server.owner ? 'Yes' : 'No'}</span>
            </div>
            <div class="detail">
              <span class="label">Member Count:</span>
              <span class="value">${server.approximate_member_count || 'Unknown'}</span>
            </div>
          </div>
        </div>
        <div class="footer">
          <div class="soft-key">Back</div>
          <div class="soft-key"></div>
          <div class="soft-key">Leave</div>
        </div>
      </div>
    `;
    
    // Add event listener for back button
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' || e.key === 'SoftLeft') {
        this.renderChannelList();
      }
    }, { once: true });
  },
  
  // Show message options
  showMessageOptions: function(message) {
    const optionsOverlay = document.createElement('div');
    optionsOverlay.className = 'options-overlay';
    optionsOverlay.innerHTML = `
      <div class="options-content">
        <div class="option selectable selected">Reply</div>
        <div class="option selectable">React</div>
        <div class="option selectable">Copy Text</div>
        ${message.author.id === this.user.id ? '<div class="option selectable">Delete</div>' : ''}
      </div>
    `;
    
    document.getElementById('app').appendChild(optionsOverlay);
    
    // Add event listener for option selection
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace') {
        optionsOverlay.remove();
      } else if (e.key === 'Enter') {
        const selectedOption = document.querySelector('.options-content .selected').textContent;
        this.handleMessageOption(selectedOption, message);
        optionsOverlay.remove();
      }
    }, { once: true });
  },
  
  // Handle message option selection
  handleMessageOption: function(option, message) {
    switch(option) {
      case 'Reply':
        this.showReplyForm(message);
        break;
      case 'React':
        this.showReactionSelector(message);
        break;
      case 'Copy Text':
        navigator.clipboard.writeText(message.content);
        break;
      case 'Delete':
        this.deleteMessage(message);
        break;
    }
  },
  
  // Show reaction selector
  showReactionSelector: function(message) {
    const commonEmojis = ['👍', '👎', '❤️', '😄', '😢', '😠', '🎉', '🤔', '👀', '✅'];
    
    const reactionOverlay = document.createElement('div');
    reactionOverlay.className = 'reaction-overlay';
    reactionOverlay.innerHTML = `
      <div class="reaction-content">
        <div class="reaction-grid">
          ${commonEmojis.map((emoji, i) => `
            <div class="emoji-item selectable ${i === 0 ? 'selected' : ''}">${emoji}</div>
          `).join('')}
        </div>
      </div>
    `;
    
    document.getElementById('app').appendChild(reactionOverlay);
    
    // Set up grid navigation
    let currentIndex = 0;
    const emojiItems = reactionOverlay.querySelectorAll('.emoji-item');
    
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace') {
        reactionOverlay.remove();
      } else if (e.key === 'ArrowRight') {
        emojiItems[currentIndex].classList.remove('selected');
        currentIndex = (currentIndex + 1) % emojiItems.length;
        emojiItems[currentIndex].classList.add('selected');
      } else if (e.key === 'ArrowLeft') {
        emojiItems[currentIndex].classList.remove('selected');
        currentIndex = (currentIndex - 1 + emojiItems.length) % emojiItems.length;
        emojiItems[currentIndex].classList.add('selected');
      } else if (e.key === 'Enter') {
        const selectedEmoji = emojiItems[currentIndex].textContent;
        this.addReaction(message, selectedEmoji);
        reactionOverlay.remove();
      }
    });
  },
  
  // Add reaction to message
  addReaction: async function(message, emoji) {
    try {
      const emojiName = encodeURIComponent(emoji);
      const response = await fetch(`${this.apiBase}/channels/${this.currentChannel}/messages/${message.id}/reactions/${emojiName}/@me`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      });
      
      if (response.ok) {
        // Reload messages to show updated reactions
        this.loadMessages(this.currentChannel);
      } else {
        alert('Failed to add reaction.');
      }
    } catch (error) {
      console.error('Error adding reaction:', error);
    }
  },
  
  // Delete a message
  deleteMessage: async function(message) {
    if (confirm('Delete this message?')) {
      try {
        const response = await fetch(`${this.apiBase}/channels/${this.currentChannel}/messages/${message.id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${this.token}`
          }
        });
        
        if (response.ok) {
          // Remove from current messages and re-render
          this.currentMessages = this.currentMessages.filter(m => m.id !== message.id);
          this.renderMessageList();
        } else {
          alert('Failed to delete message.');
        }
      } catch (error) {
        console.error('Error deleting message:', error);
      }
    }
  },
  
  // Show reply form
  showReplyForm: function(message) {
    const replyForm = document.createElement('div');
    replyForm.className = 'reply-form';
    replyForm.innerHTML = `
      <div class="replying-to">
        Replying to ${message.author.username}
      </div>
      <input type="text" id="reply-input" placeholder="Type your reply..." />
      <div class="button-row">
        <button id="send-reply-button">Send</button>
        <button id="cancel-reply-button">Cancel</button>
      </div>
    `;
    
    document.getElementById('app').appendChild(replyForm);
    document.getElementById('reply-input').focus();
    
    document.getElementById('send-reply-button').addEventListener('click', () => {
      const content = document.getElementById('reply-input').value;
      if (content.trim()) {
        this.sendReply(message, content);
      }
      replyForm.remove();
    });
    
    document.getElementById('cancel-reply-button').addEventListener('click', () => {
      replyForm.remove();
    });
  },
  
  // Send a reply to a message
  sendReply: async function(message, content) {
    try {
      const response = await fetch(`${this.apiBase}/channels/${this.currentChannel}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: content,
          message_reference: {
            message_id: message.id,
            channel_id: this.currentChannel,
            guild_id: this.currentServer
          }
        })
      });
      
      if (response.ok) {
        // Reload messages to show the reply
        this.loadMessages(this.currentChannel);
      } else {
        alert('Failed to send reply.');
      }
    } catch (error) {
      console.error('Error sending reply:', error);
    }
  },
  
  // Handle logout
  logout: function() {
    if (confirm('Are you sure you want to log out?')) {
      localStorage.removeItem('discord-token');
      this.token = null;
      this.user = null;
      this.servers = [];
      this.channels = {};
      this.currentMessages = [];
      this.currentView = 'serverList';
      this.selectedIndex = 0;
      this.renderLoginScreen();
    }
  }
};

// CSS Styles for the application
const loadStyles = function() {
  const style = document.createElement('style');
  style.textContent = `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: sans-serif;
      background-color: #36393f;
      color: #dcddde;
      height: 240px;
      width: 320px;
      overflow: hidden;
    }
    
    #app {
      height: 100%;
      width: 100%;
      display: flex;
      flex-direction: column;
    }
    
    .header {
      background-color: #202225;
      color: white;
      padding: 5px;
      text-align: center;
      font-weight: bold;
      height: 30px;
      line-height: 20px;
    }
    
    .footer {
      background-color: #202225;
      color: white;
      display: flex;
      justify-content: space-between;
      padding: 5px;
      height: 25px;
      font-size: 12px;
    }
    
    .server-list, .channel-list, .message-list {
      overflow-y: auto;
      flex: 1;
    }
    
    .server-item, .channel-item {
      padding: 8px 5px;
      display: flex;
      align-items: center;
      border-bottom: 1px solid #40444b;
    }
    
    .message-item {
      padding: 5px;
      border-bottom: 1px solid #40444b;
    }
    
    .selected {
      background-color: #5865f2;
      color: white;
    }
    
    .server-icon, .channel-icon {
      width: 20px;
      height: 20px;
      margin-right: 8px;
      background-color: #7289da;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
    }
    
    .channel-icon {
      background-color: transparent;
      color: #72767d;
    }
    
    .message-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 2px;
      font-size: 12px;
    }
    
    .author {
      font-weight: bold;
      color: #fff;
    }
    
    .timestamp {
      color: #72767d;
      font-size: 10px;
    }
    
    .message-content {
      font-size: 12px;
      line-height: 16px;
      word-wrap: break-word;
    }
    
    .login-screen {
      display: flex;
      flex-direction: column;
      padding: 20px;
      height: 100%;
    }
    
    .logo {
      text-align: center;
      font-size: 24px;
      font-weight: bold;
      color: white;
      margin-bottom: 20px;
    }
    
    input {
      padding: 8px;
      margin-bottom: 10px;
      border-radius: 3px;
      border: none;
      background-color: #40444b;
      color: white;
    }
    
    button {
      padding: 8px;
      background-color: #5865f2;
      color: white;
      border: none;
      border-radius: 3px;
      cursor: pointer;
    }
    
    .options-overlay, .reaction-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0,0,0,0.8);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .options-content, .reaction-content {
      background-color: #36393f;
      width: 80%;
      border-radius: 5px;
      overflow: hidden;
    }
    
    .option {
      padding: 10px;
      border-bottom: 1px solid #40444b;
    }
    
    .reaction-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 5px;
      padding: 10px;
    }
    
    .emoji-item {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 30px;
      font-size: 18px;
    }
    
    .message-form, .reply-form {
      position: absolute;
      bottom: 25px;
      left: 0;
      width: 100%;
      background-color: #40444b;
      padding: 10px;
    }
    
    .replying-to {
      font-size: 12px;
      color: #72767d;
      margin-bottom: 5px;
    }
    
    .button-row {
      display: flex;
      justify-content: space-between;
      margin-top: 5px;
    }
    
    .profile-view, .server-info-view {
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    
    .profile-content, .server-info-content {
      flex: 1;
      padding: 15px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    
    .avatar {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background-color: #7289da;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      margin-bottom: 10px;
    }
    
    .username {
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 5px;
    }
    
    .discriminator {
      color: #72767d;
      margin-bottom: 15px;
    }
    
    .status-selector {
      width: 100%;
    }
    
    .status-item {
      padding: 8px;
      margin-bottom: 5px;
      border-radius: 3px;
    }
    
    .server-details {
      width: 100%;
      margin-top: 15px;
    }
    
    .detail {
      display: flex;
      justify-content: space-between;
      padding: 5px 0;
      border-bottom: 1px solid #40444b;
    }
    
    code {
      background-color: #2f3136;
      padding: 2px 4px;
      border-radius: 3px;
      font-family: monospace;
    }
    
    pre {
      background-color: #2f3136;
      padding: 5px;
      border-radius: 3px;
      white-space: pre-wrap;
      font-family: monospace;
      margin: 5px 0;
    }
  `;
  document.head.appendChild(style);
};

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  // Create app container
  const appContainer = document.createElement('div');
  appContainer.id = 'app';
  document.body.appendChild(appContainer);
  
  // Load styles
  loadStyles();
  
  // Initialize Discord KaiOS
  DiscordKaiOS.init();
  
  // Set up network connectivity monitoring
  window.addEventListener('online', function() {
    if (DiscordKaiOS.token) {
      DiscordKaiOS.loadServers();
    }
  });
  
  window.addEventListener('offline', function() {
    alert('Network connection lost. Some features may not work.');
  });
  
  // Setup push notifications if available
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(function(registration) {
        console.log('ServiceWorker registration successful');
        
        // Request notification permission
        if ('Notification' in window) {
          Notification.requestPermission();
        }
      })
      .catch(function(error) {
        console.log('ServiceWorker registration failed:', error);
      });
  }
});
