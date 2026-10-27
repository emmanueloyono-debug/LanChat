/* ═══════════════════════════════════════════════════════════════
   AI Assistant Module — Floating panel powered by Groq
   Communicates with /api/ai server-side proxy
═══════════════════════════════════════════════════════════════ */

'use strict';

let aiHistory = [];
let aiPanelOpen = false;

// ─── Create the AI Panel DOM ─────────────────────────────────────────────────
function createAIPanel() {
    const panel = document.createElement('div');
    panel.id = 'ai-panel';
    panel.className = 'ai-panel';
    panel.innerHTML = `
        <div class="ai-panel-header">
            <div class="ai-panel-title">
                <i class="fas fa-robot"></i>
                <span>AI Tutor</span>
            </div>
            <button class="ai-panel-close" id="ai-panel-close" aria-label="Close AI panel">
                <i class="fas fa-xmark"></i>
            </button>
        </div>
        <div class="ai-messages" id="ai-messages">
            <div class="ai-welcome">
                <i class="fas fa-graduation-cap ai-welcome-icon"></i>
                <p class="ai-welcome-text">Hi! I'm your AI Tutor. Ask me anything about your studies.</p>
            </div>
        </div>
        <form class="ai-input-form" id="ai-input-form">
            <input type="text" id="ai-input" class="ai-input" placeholder="Ask a question…" autocomplete="off" maxlength="2000">
            <button type="submit" class="ai-send-btn" title="Send">
                <i class="fas fa-paper-plane"></i>
            </button>
        </form>
    `;
    document.body.appendChild(panel);

    // Close button
    document.getElementById('ai-panel-close').addEventListener('click', toggleAIPanel);

    // Form submit
    document.getElementById('ai-input-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('ai-input');
        const message = input.value.trim();
        if (!message) return;
        input.value = '';
        await sendAIMessage(message);
    });

    // Enter to submit
    document.getElementById('ai-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            document.getElementById('ai-input-form').requestSubmit();
        }
    });
}

// ─── Toggle Panel ────────────────────────────────────────────────────────────
function toggleAIPanel() {
    const panel = document.getElementById('ai-panel');
    if (!panel) {
        createAIPanel();
    }
    aiPanelOpen = !aiPanelOpen;
    document.getElementById('ai-panel').classList.toggle('open', aiPanelOpen);
    if (aiPanelOpen) {
        document.getElementById('ai-input').focus();
    }
}

// ─── Append a message bubble ─────────────────────────────────────────────────
function appendAIBubble(role, content) {
    const container = document.getElementById('ai-messages');
    // Remove welcome on first message
    const welcome = container.querySelector('.ai-welcome');
    if (welcome) welcome.remove();

    const bubble = document.createElement('div');
    bubble.className = `ai-bubble ai-bubble-${role}`;

    if (role === 'assistant') {
        // Render markdown-like formatting for AI responses
        bubble.innerHTML = formatAIResponse(content);
    } else {
        bubble.textContent = content;
    }

    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
    return bubble;
}

// ─── Simple markdown-like formatting ─────────────────────────────────────────
function formatAIResponse(text) {
    // Escape HTML first
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Code blocks ```...```
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
    // Inline code `...`
    html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    // Bold **...**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic *...*
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Line breaks
    html = html.replace(/\n/g, '<br>');

    return html;
}

// ─── Send Message to AI Proxy ────────────────────────────────────────────────
async function sendAIMessage(message) {
    appendAIBubble('user', message);

    // Show typing indicator bubble which we will update
    const typingBubble = appendAIBubble('assistant', '');
    typingBubble.innerHTML = '<span class="ai-typing"><span></span><span></span><span></span></span>';

    let fullReply = '';

    try {
        const baseUrl = window.SERVER_URL || '';
        const res = await fetch(`${baseUrl}/api/ai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, history: aiHistory })
        });

        if (!res.ok) {
            let errorMsg = 'Something went wrong.';
            try {
                const data = await res.json();
                if (data.error) errorMsg = data.error;
            } catch (e) { }
            typingBubble.textContent = errorMsg;
            typingBubble.classList.add('ai-bubble-error');
            return;
        }

        // Clear the typing indicator before streaming starts
        typingBubble.innerHTML = '';
        const container = document.getElementById('ai-messages');

        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });

            // Groq sends Server-Sent Events like "data: {...}\n\n"
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                    try {
                        const data = JSON.parse(line.substring(6));
                        const content = data.choices[0]?.delta?.content || '';
                        fullReply += content;
                        // Progressive markdown render
                        typingBubble.innerHTML = formatAIResponse(fullReply);
                        container.scrollTop = container.scrollHeight;
                    } catch (e) {
                        // ignore parse errors for partial chunks
                    }
                }
            }
        }

        // Update history for context
        aiHistory.push({ role: 'user', content: message });
        aiHistory.push({ role: 'assistant', content: fullReply });

        // Keep history under 20 turns
        if (aiHistory.length > 20) {
            aiHistory = aiHistory.slice(-20);
        }

    } catch (err) {
        typingBubble.textContent = 'Could not reach AI. Check internet connection.';
        typingBubble.classList.add('ai-bubble-error');
    }

    const container = document.getElementById('ai-messages');
    container.scrollTop = container.scrollHeight;
}

// ─── Initialize on DOM ready ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const aiBtn = document.getElementById('btn-ai-tutor');
    if (aiBtn) {
        aiBtn.addEventListener('click', toggleAIPanel);
    }
});
