import { ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import { SharedState } from './sharedState';
import CopilotPlugin from "./main";
import axios from 'axios';


export default class ChatGPTView extends ItemView {
  sharedState: SharedState;
  plugin: CopilotPlugin;
  model: string;

  constructor(leaf: WorkspaceLeaf, plugin: CopilotPlugin) {
    super(leaf);
    this.sharedState = plugin.sharedState;
    this.plugin = plugin;
    // TODO: Add a dropdown menu to select the model in iconsContainer
    this.model = this.plugin.settings.defaultModel;
  }

  // Return a unique identifier for this view
  getViewType(): string {
    return 'chat-gpt-view';
  }

  // Return an icon for this view
  getIcon(): string {
    return 'message-square';
  }

  // Return a title for this view
  getTitle(): string {
    return 'ChatGPT';
  }

  // Implement the getDisplayText method
  getDisplayText(): string {
    return 'ChatGPT';
  }

  // Render the chat interface and add event listeners
  async onOpen() {
    // Check if the chat interface is already created
    if (!this.containerEl.querySelector('.chat-container')) {
      this.createChatInterface();
    }
  }

  async onClose() {
  }

  // Create the chat interface
  createChatInterface() {
    this.containerEl.empty();

    // Create the chat interface HTML
    const container = this.containerEl.createDiv({ cls: 'chat-container' });
    const chatMessages = container.createDiv({ cls: 'chat-messages' });
    const bottomContainer = container.createDiv({ cls: 'bottom-container' });

    const chatIconsContainer = bottomContainer.createDiv({ cls: 'chat-icons-container' });

    const refreshIcon = this.containerEl.createEl('i', { cls: 'icon' });
    setIcon(refreshIcon, 'refresh-cw');
    // Create the 'Regenerate Response' button
    const regenerateButton = chatIconsContainer.createEl('button', { cls: 'regenerate-button' });
    const regenerateButtonText = document.createTextNode('\u00A0Regenerate Response');
    regenerateButton.appendChild(refreshIcon);
    regenerateButton.appendChild(regenerateButtonText);

    const newChatIcon = this.containerEl.createEl('i', { cls: 'icon' });
    setIcon(newChatIcon, 'refresh-ccw');
    const newChatButton = chatIconsContainer.createEl(
      'button',
      { cls: 'icon-only-button new-chat-button', title: 'New Chat' }
    );
    newChatButton.appendChild(newChatIcon);

    const chatInputContainer = bottomContainer.createDiv({ cls: 'chat-input-container' });
    const chatInput = chatInputContainer.createEl('textarea', { placeholder: 'Type your message here...' });
    const chatSendButton = chatInputContainer.createEl('button', { text: 'Send' });

    // Add event listeners
    chatSendButton.addEventListener('click', () => {
      this.handleSendMessage(chatInput as HTMLTextAreaElement, chatMessages as HTMLDivElement);
    });

    chatInput.addEventListener('keydown', (event) => {
      // Check if the 'shift' key is pressed and the 'enter' key is pressed
      if (event.shiftKey && event.key === 'Enter') {
        // Prevent the default behavior of 'Enter' key press
        event.preventDefault();
        // Create a new line
        chatInput.value += '\n';
        return;
      }
      if (event.key === 'Enter') {
        this.handleSendMessage(chatInput as HTMLTextAreaElement, chatMessages as HTMLDivElement);
      }
    });

    chatInput.addEventListener('input', () => {
      this.autosize(chatInput as HTMLTextAreaElement);
    });

    // Load the chat history
    const chatHistory = this.sharedState.getMessages();
    for (const { message, sender } of chatHistory) {
      this.appendMessage(chatMessages, message, sender);
    }
    this.scrollToBottom(chatMessages);
  }

  // Create a message element and append it to the chatMessages div
  appendMessage(chatMessages: HTMLDivElement, message: string, sender: string) {
    const messageEl = chatMessages.createDiv({ cls: `chat-message ${sender}` });

    // Create message content div
    const messageContent = messageEl.createDiv({ cls: 'chat-message-content' });

    // Create clipboard icon and button
    const clipboardIcon = this.containerEl.createEl('i', { cls: 'icon' });
    setIcon(clipboardIcon, 'clipboard');
    const clipboardButton = messageEl.createEl(
      'button',
      { cls: 'icon-only-button clipboard-button', title: 'Copy to clipboard' });

    // Append icon to button
    clipboardButton.appendChild(clipboardIcon);

    // Add response message formatting
    messageContent.innerHTML = message.replace(/\n/g, '<br>');

    // Append clipboard button to message element
    messageEl.insertAdjacentElement('beforeend', clipboardButton);

    // Add event listener to the clipboard button
    clipboardButton.addEventListener('click', async () => {
      try {
        // Use the Clipboard API to write the text to the clipboard
        await navigator.clipboard.writeText(message);
      } catch (err) {
        console.error('Failed to copy the message to the clipboard:', err);
      }
    });
  }

  // Add a method to handle sending messages to ChatGPT
  async handleSendMessage(chatInput: HTMLTextAreaElement, chatMessages: HTMLDivElement) {
    const message = chatInput.value;

    // Append the user's message to the chat interface
    this.appendMessage(chatMessages, message, 'user');
    // Store the user's message in the chat history
    this.sharedState.addMessage({ message, sender: 'user' });

    // Your ChatGPT API interaction logic here
    console.log(`Sending message: ${message}`);

    // Create a loading message
    const loadingMessageEl = this.createLoadingMessage(chatMessages);

    // Display the running "..." effect when waiting for a response.
    let dotCount = 0;
    const maxDots = 4;
    const dotInterval = setInterval(() => {
      if (dotCount >= maxDots) {
        dotCount = 0;
        loadingMessageEl.innerHTML = '';
      } else {
        loadingMessageEl.innerHTML += '.';
        dotCount++;
      }
    }, 500);

    // After receiving a response from the ChatGPT API, append it to the chat interface
    // const chatGPTResponse = "Hello! I'm a chatbot. Ask me a question.";
    const chatGPTResponse = await this.getChatGPTResponse(message);
    clearInterval(dotInterval); // Stop the running "..." effect
    if (loadingMessageEl.parentElement) {
      loadingMessageEl.parentElement.remove();
    }

    this.appendMessage(chatMessages, chatGPTResponse, this.model);
    this.scrollToBottom(chatMessages);
    // Store the response in the chat history
    this.sharedState.addMessage({ message: chatGPTResponse, sender: this.model });

    // Clear the textarea content after sending the message with a slight delay
    setTimeout(() => {
      chatInput.value = '';
      this.autosize(chatInput); // Reset the textarea height after clearing its value
    }, 10);
  }

  // Get a response from the ChatGPT API
  async getChatGPTResponse(message: string): Promise<string> {
    const apiKey = this.plugin.settings.openAiApiKey;

    if (!apiKey) {
      console.error('API key is not set.');
      return 'Error: API key is not set.';
    }
    if (!this.model) {
      console.error('Model is not set.');
      return 'Error: Model is not set.';
    }

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: this.model,
          // TODO: Add support for more chat history as context
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: message },
          ],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
        }
      );

      const responseMessage = response.data.choices[0].message.content;
      return responseMessage
    } catch (error) {
      console.error('Failed to get response from OpenAI API:', error);
      return 'Error: Failed to get response from OpenAI API.';
    }
  }

  private scrollToBottom(chatMessages: HTMLDivElement) {
    window.requestAnimationFrame(() => {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    });
  }

  private autosize(textarea: HTMLTextAreaElement) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }

  private createLoadingMessage(chatMessages: HTMLDivElement): HTMLDivElement {
    const messageEl = chatMessages.createDiv({ cls: 'chat-message loading' });
    const messageContent = messageEl.createDiv({ cls: 'chat-message-content' });
    messageContent.innerHTML = '';
    return messageContent;
  }
}