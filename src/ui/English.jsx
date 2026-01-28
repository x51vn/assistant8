/**
 * GPT-046: English Preact component
 * English learning page with topic input and saved sentences
 */
import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { MESSAGE_TYPES } from '../shared/messageSchema.js';
import { generateCorrelationId } from '../logger.js';

export default function English() {
  const [topic, setTopic] = useState('');
  const [savedSentences, setSavedSentences] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generatingIndex, setGeneratingIndex] = useState(null);
  const [settings, setSettings] = useState({});

  useEffect(() => {
    loadSettings();
    loadSavedSentences();
  }, []);

  async function loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.SETTINGS_GET,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
      });

      if (!response.errorCode && response.data) {
        setSettings(response.data);
      }
    } catch (error) {
      console.error('Load settings error:', error);
    }
  }

  async function loadSavedSentences() {
    setLoading(true);
    try {
      const response = await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.ENGLISH_GET_SENTENCES,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
      });

      if (!response.errorCode && response.data?.items) {
        setSavedSentences(response.data.items);
      }
    } catch (error) {
      console.error('Load sentences error:', error);
    } finally {
      setLoading(false);
    }
  }

  async function generateSentences() {
    if (!topic.trim()) {
      alert('Vui lòng nhập chủ đề');
      return;
    }

    const engPrompt = settings.englishPromptInput || 'Tạo 3 câu tiếng Anh đơn giản về chủ đề: {TOPIC}';
    const finalPrompt = engPrompt.replace('{TOPIC}', topic);

    setGeneratingIndex(0);

    try {
      const response = await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.SEND_PROMPT,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        data: {
          prompt: finalPrompt,
          source: 'english-learning',
        },
      });

      if (response.errorCode) {
        alert('Lỗi: ' + response.errorMessage);
        return;
      }

      // Refresh sentences list
      setTimeout(() => loadSavedSentences(), 1000);
    } catch (error) {
      alert('Lỗi khi gửi prompt: ' + error.message);
    } finally {
      setGeneratingIndex(null);
    }
  }

  async function deleteSentence(sentenceId) {
    if (!confirm('Xóa câu này?')) return;

    try {
      const response = await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.ENGLISH_DELETE_SENTENCE,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        data: { id: sentenceId },
      });

      if (response.errorCode) {
        alert('Lỗi: ' + response.errorMessage);
      } else {
        setSavedSentences((prev) => prev.filter((s) => s.id !== sentenceId));
      }
    } catch (error) {
      console.error('Delete error:', error);
    }
  }

  async function markAsLearned(sentenceId) {
    try {
      const response = await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.ENGLISH_UPDATE_SENTENCE,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        data: { id: sentenceId, learned: true },
      });

      if (!response.errorCode) {
        setSavedSentences((prev) =>
          prev.map((s) => (s.id === sentenceId ? { ...s, learned: true } : s))
        );
      }
    } catch (error) {
      console.error('Update error:', error);
    }
  }

  return (
    <div id="english" className="page">
      <div className="content">
        <h2>📚 Học Tiếng Anh</h2>

        <div style={{ background: '#f0f4ff', border: '1px solid #d0e0ff', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
          <h3 style={{ marginTop: 0, color: '#1a73e8' }}>Tạo câu mới</h3>

          <div className="form-group">
            <label htmlFor="topic">Chủ đề (topic):</label>
            <input
              id="topic"
              type="text"
              className="text-input"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') generateSentences();
              }}
              placeholder="Ví dụ: 'coffee shop', 'job interview'..."
              style={{ width: '100%' }}
            />
          </div>

          <button
            className="primary-btn"
            onClick={generateSentences}
            disabled={generatingIndex !== null || !topic.trim()}
            style={{ width: '100%' }}
          >
            {generatingIndex !== null ? (
              <>
                <i className="fas fa-spinner fa-spin"></i> Đang tạo...
              </>
            ) : (
              <>
                <i className="fas fa-magic"></i> Tạo câu
              </>
            )}
          </button>
        </div>

        {/* Saved Sentences List */}
        <div style={{ borderTop: '1px solid #ddd', paddingTop: '20px' }}>
          <h3 style={{ marginTop: 0 }}>
            📝 Câu đã lưu ({savedSentences.length})
          </h3>

          {loading ? (
            <p className="empty-state">
              <i className="fas fa-spinner fa-spin"></i> Đang tải...
            </p>
          ) : savedSentences.length === 0 ? (
            <p className="empty-state">
              <i className="fas fa-inbox"></i> Chưa có câu nào. Tạo câu đầu tiên!
            </p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr',
                gap: '12px',
              }}
            >
              {savedSentences.map((sentence) => (
                <div
                  key={sentence.id}
                  className={`sentence-card ${sentence.learned ? 'learned' : ''}`}
                  style={{
                    background: sentence.learned ? '#f0f0f0' : '#fff',
                    border: `1px solid ${sentence.learned ? '#ccc' : '#e0e0e0'}`,
                    borderLeft: `4px solid ${sentence.learned ? '#4caf50' : '#667eea'}`,
                    padding: '12px',
                    borderRadius: '4px',
                    opacity: sentence.learned ? 0.7 : 1,
                  }}
                >
                  <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', fontSize: '13px', color: '#333' }}>
                    {sentence.english}
                  </p>
                  {sentence.vietnamese && (
                    <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666' }}>
                      <em>{sentence.vietnamese}</em>
                    </p>
                  )}
                  {sentence.topic && (
                    <p style={{ margin: '0 0 8px 0', fontSize: '11px', color: '#999' }}>
                      📌 Topic: <strong>{sentence.topic}</strong>
                    </p>
                  )}

                  <div className="button-group" style={{ marginTop: '8px' }}>
                    {!sentence.learned && (
                      <button
                        className="secondary-btn"
                        onClick={() => markAsLearned(sentence.id)}
                        style={{ fontSize: '11px', padding: '4px 8px' }}
                        title="Đánh dấu là đã học"
                      >
                        <i className="fas fa-check"></i> Học rồi
                      </button>
                    )}
                    <button
                      className="secondary-btn"
                      onClick={() => deleteSentence(sentence.id)}
                      style={{ fontSize: '11px', padding: '4px 8px', color: '#d32f2f' }}
                      title="Xóa câu"
                    >
                      <i className="fas fa-trash"></i> Xóa
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stats */}
        {savedSentences.length > 0 && (
          <div
            style={{
              marginTop: '20px',
              padding: '12px',
              background: '#f5f5f5',
              borderRadius: '4px',
              textAlign: 'center',
              fontSize: '12px',
              color: '#666',
            }}
          >
            📊 Đã học: <strong>{savedSentences.filter((s) => s.learned).length}</strong> /{' '}
            <strong>{savedSentences.length}</strong> câu
          </div>
        )}
      </div>
    </div>
  );
}
