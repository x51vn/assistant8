/**
 * WritingPage.jsx - Writing Assistant page
 * Generate written content using ChatGPT with various templates
 *
 * Features:
 * - 6 writing job types (email, social, summarize, rewrite, translate, outline)
 * - Dynamic form based on selected job
 * - Generate and polling mechanism
 * - Copy and Insert functionality
 * - History panel filtered by module
 */

import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import {
  sendWritingJob,
  pollWritingOutput,
  openWritingChat,
  fetchWritingHistory,
  copyToClipboard,
  insertIntoActiveElement,
  autoSelectTopic
} from '../api/writingApi.js';
import { createConfluencePage, textToConfluenceStorage } from '../api/atlassianApi.js';
import { setGlobalLoading, hideLoading } from '../state/appState.js';

/**
 * Format date for display
 */
function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit'
  });
}

/**
 * Job configuration with forms
 */
const JOB_TYPES = {
  email: {
    id: 'email',
    label: 'Viết email',
    icon: 'fas fa-envelope',
    inputs: [
      { name: 'keyPoints', label: 'Nội dung chính (bắt buộc)', type: 'textarea', required: true, placeholder: 'Các điểm quan trọng cần gửi' },
      { name: 'context', label: 'Bối cảnh (tùy chọn)', type: 'textarea', placeholder: 'Thông tin nền, lịch sử...' },
      { name: 'recipient', label: 'Người nhận (tùy chọn)', type: 'text', placeholder: 'VD: khách hàng, sếp, dev team' }
    ],
    options: [
      { name: 'emailGoal', label: 'Mục đích email', type: 'select', options: ['inform', 'request', 'decline', 'follow_up', 'negotiate'], default: 'inform' },
      { name: 'includeSubject', label: 'Bao gồm tiêu đề', type: 'checkbox', default: true },
      { name: 'tone', label: 'Tone', type: 'select', options: ['formal', 'neutral', 'friendly', 'assertive'], default: 'formal' },
      { name: 'audience', label: 'Đối tượng', type: 'text', placeholder: 'VD: chuyên viên kỹ thuật' },
      { name: 'length', label: 'Độ dài', type: 'select', options: ['short', 'medium', 'long'], default: 'medium' },
      { name: 'languageOutput', label: 'Ngôn ngữ output', type: 'select', options: ['vi', 'en'], default: 'vi' }
    ]
  },

  social: {
    id: 'social',
    label: 'Viết bài social',
    icon: 'fas fa-share-alt',
    inputs: [
      { name: 'rawContent', label: 'Nội dung (để trống để AI tự đề xuất)', type: 'textarea', required: false, placeholder: 'Ý chính hoặc nội dung thô (để trống = AI tự chọn chủ đề)' },
      { name: 'link', label: 'Link (tùy chọn)', type: 'text', placeholder: 'https://...' }
    ],
    options: [
      { name: 'platform', label: 'Nền tảng', type: 'select', options: ['facebook', 'linkedin', 'x'], default: 'facebook' },
      { name: 'cta', label: 'Hành động', type: 'select', options: ['none', 'comment', 'follow', 'dm'], default: 'none' },
      { name: 'hashtags', label: 'Hashtags', type: 'select', options: ['0', '3', '5', '10'], default: '5' },
      { name: 'variants', label: 'Số phiên bản', type: 'select', options: ['1', '2', '3'], default: '1' },
      { name: 'tone', label: 'Tone', type: 'select', options: ['engaging', 'professional', 'casual', 'inspiring'], default: 'engaging' },
      { name: 'languageOutput', label: 'Ngôn ngữ output', type: 'select', options: ['vi', 'en'], default: 'vi' }
    ]
  },

  summarize: {
    id: 'summarize',
    label: 'Tóm tắt',
    icon: 'fas fa-list',
    inputs: [
      { name: 'sourceText', label: 'Văn bản cần tóm tắt (bắt buộc)', type: 'textarea', required: true, placeholder: 'Paste nội dung cần tóm tắt' }
    ],
    options: [
      { name: 'summaryStyle', label: 'Kiểu tóm tắt', type: 'select', options: ['tldr', 'bullets', 'executive'], default: 'tldr' },
      { name: 'focus', label: 'Tập trung vào', type: 'select', options: ['key_points', 'action_items', 'risks'], default: 'key_points' },
      { name: 'maxLines', label: 'Tối đa dòng', type: 'number', default: '8' },
      { name: 'languageOutput', label: 'Ngôn ngữ output', type: 'select', options: ['vi', 'en'], default: 'vi' }
    ]
  },

  rewrite: {
    id: 'rewrite',
    label: 'Viết lại',
    icon: 'fas fa-pen',
    inputs: [
      { name: 'sourceText', label: 'Văn bản gốc (bắt buộc)', type: 'textarea', required: true, placeholder: 'Paste nội dung cần viết lại' }
    ],
    options: [
      { name: 'rewriteGoal', label: 'Mục đích', type: 'select', options: ['clearer', 'shorter', 'more_persuasive', 'less_emotional'], default: 'clearer' },
      { name: 'faithfulness', label: 'Độ chính xác', type: 'select', options: ['strict', 'normal'], default: 'normal' },
      { name: 'targetLength', label: 'Độ dài đích', type: 'select', options: ['short', 'medium', 'long'], default: 'medium' },
      { name: 'tone', label: 'Tone', type: 'select', options: ['formal', 'neutral', 'friendly', 'professional'], default: 'neutral' },
      { name: 'audience', label: 'Đối tượng', type: 'text', placeholder: 'VD: sinh viên, chuyên gia' },
      { name: 'languageOutput', label: 'Ngôn ngữ output', type: 'select', options: ['vi', 'en'], default: 'vi' }
    ]
  },

  translate: {
    id: 'translate',
    label: 'Dịch',
    icon: 'fas fa-globe',
    inputs: [
      { name: 'sourceText', label: 'Văn bản cần dịch (bắt buộc)', type: 'textarea', required: true, placeholder: 'Paste nội dung cần dịch' }
    ],
    options: [
      { name: 'direction', label: 'Hướng dịch', type: 'select', options: ['auto', 'vi_to_en', 'en_to_vi'], default: 'auto' },
      { name: 'style', label: 'Kiểu dịch', type: 'select', options: ['natural', 'literal'], default: 'natural' },
      { name: 'domain', label: 'Lĩnh vực', type: 'select', options: ['general', 'business', 'tech'], default: 'general' },
      { name: 'glossary', label: 'Thuật ngữ (tùy chọn)', type: 'textarea', placeholder: 'Mỗi dòng: term = translation' },
      { name: 'languageOutput', label: 'Ngôn ngữ output', type: 'select', options: ['vi', 'en'], default: 'vi' }
    ]
  },

  outline: {
    id: 'outline',
    label: 'Viết dàn ý',
    icon: 'fas fa-sitemap',
    inputs: [
      { name: 'topic', label: 'Chủ đề (bắt buộc)', type: 'text', required: true, placeholder: 'Chủ đề bài viết' },
      { name: 'goal', label: 'Mục đích (bắt buộc)', type: 'textarea', required: true, placeholder: 'Mục tiêu của bài viết' },
      { name: 'mustInclude', label: 'Bắt buộc có (tùy chọn)', type: 'textarea', placeholder: 'Ý tưởng/mục bắt buộc có trong dàn ý' }
    ],
    options: [
      { name: 'docType', label: 'Loại tài liệu', type: 'select', options: ['blog', 'email', 'report', 'script'], default: 'blog' },
      { name: 'structureDepth', label: 'Độ sâu', type: 'select', options: ['h2_only', 'h2_h3'], default: 'h2_h3' },
      { name: 'includeExamples', label: 'Bao gồm ví dụ', type: 'checkbox', default: false },
      { name: 'languageOutput', label: 'Ngôn ngữ output', type: 'select', options: ['vi', 'en'], default: 'vi' }
    ]
  },

  english_learning: {
    id: 'english_learning',
    label: 'English Learning',
    icon: 'fas fa-book',
    inputs: [
      { name: 'topic', label: 'Topic (optional)', type: 'text', required: false, placeholder: 'Leave empty for AI to pick trending topic' }
    ],
    options: [
      { name: 'autoSelect', label: 'Let AI pick topic', type: 'checkbox', default: false },
      { name: 'languageOutput', label: 'Language output', type: 'select', options: ['vi', 'en'], default: 'vi' }
    ]
  }
};

/**
 * WritingHistoryItem component
 */
function WritingHistoryItem({ item, onOpen, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = async () => {
    setConfirmDelete(false);
    if (onDelete) {
      await onDelete(item.id);
    }
  };

  const handleClick = (e) => {
    if (e.target.closest('.btn-delete')) return;
    if (onOpen && item.chat_url) {
      onOpen(item.chat_url);
    }
  };

  const jobType = item.metadata?.jobType || 'unknown';
  const jobLabel = JOB_TYPES[jobType]?.label || jobType;

  return (
    <div class="result-item writing-history-item" onClick={handleClick}>
      <div class="writing-content">
        <div class="writing-job"><i class={JOB_TYPES[jobType]?.icon || 'fas fa-file'}></i> {jobLabel}</div>
        <div class="writing-preview">{item.prompt?.substring(0, 80)}...</div>
        <div class="writing-meta">
          {formatDate(item.timestamp)}
        </div>
      </div>
      <button
        class="btn-icon btn-delete"
        title="Xóa"
        onClick={(e) => {
          e.stopPropagation();
          setConfirmDelete(true);
        }}
      >
        <i class="fas fa-times"></i>
      </button>

      {confirmDelete && (
        <div class="confirm-dialog-overlay" onClick={() => setConfirmDelete(false)}>
          <div class="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Xóa lịch sử?</h3>
            <p>Bạn có chắc chắn muốn xóa mục này?</p>
            <div class="confirm-buttons">
              <button class="btn-cancel" onClick={() => setConfirmDelete(false)}>
                Hủy
              </button>
              <button class="btn-confirm-delete" onClick={handleDelete}>
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * WritingPage component
 */
export function WritingPage() {
  const [selectedJob, setSelectedJob] = useState('email');
  const [inputs, setInputs] = useState({});
  const [options, setOptions] = useState({});
  const [generating, setGenerating] = useState(false);
  const [output, setOutput] = useState(null);
  const [resultMessage, setResultMessage] = useState(null);
  const [toast, setToast] = useState(null);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [activeTab, setActiveTab] = useState('output'); // 'output' or 'history'
  const [uploadToConfluence, setUploadToConfluence] = useState(false);
  const [confluenceSpace, setConfluenceSpace] = useState('');
  const [confluenceTitle, setConfluenceTitle] = useState('');
  const [confluenceUploading, setConfluenceUploading] = useState(false);
  const pollIntervalRef = useRef(null);
  const currentJobRef = useRef(null);
  const currentInputsRef = useRef(null);
  const currentOptionsRef = useRef(null);

  // Initialize options with defaults when job changes
  useEffect(() => {
    const job = JOB_TYPES[selectedJob];
    const newOptions = {};
    job.options.forEach(opt => {
      newOptions[opt.name] = opt.default || '';
    });
    setOptions(newOptions);
    setInputs({});
    setOutput(null);
    setResultMessage(null);
  }, [selectedJob]);

  // Load history on mount
  useEffect(() => {
    loadHistory();
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadHistory = async () => {
    const result = await fetchWritingHistory(20);
    if (!result.error) {
      setHistory(result.items);
    }
  };

  const handleInputChange = (name, value) => {
    setInputs(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleOptionChange = (name, value) => {
    setOptions(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const pollForResponse = async () => {
    let pollCount = 0;
    const maxPolls = 60; // 3 minutes

    pollIntervalRef.current = setInterval(async () => {
      pollCount++;

      if (pollCount > maxPolls) {
        stopPolling();
        setResultMessage({
          type: 'error',
          text: '⏱️ Timeout - ChatGPT không phản hồi sau 3 phút'
        });
        setGenerating(false);
        return;
      }

      setResultMessage({
        type: 'loading',
        text: `Đang chờ output... (${pollCount * 3}s)`
      });

      const result = await pollWritingOutput();

      if (result.output) {
        stopPolling();
        setOutput({
          content: result.output,
          chatId: result.chatId,
          chatUrl: result.chatUrl
        });

        // Save to history
        await loadHistory();

        setResultMessage({
          type: 'success',
          text: `Đã tạo! Bạn có thể copy, insert, hoặc mở ChatGPT để tiếp tục`
        });

        setGenerating(false);

        // Auto-upload to Confluence if checkbox is checked
        if (uploadToConfluence && confluenceSpace) {
          await handleConfluenceUpload(result.output);
        }

        currentJobRef.current = null;
        currentInputsRef.current = null;
        currentOptionsRef.current = null;
      }
    }, 3000);
  };

  const handleGenerate = async () => {
    const job = JOB_TYPES[selectedJob];
    let finalInputs = { ...inputs };

    // Auto-generate content for social if user leaves rawContent empty
    if (selectedJob === 'social' && !inputs.rawContent) {
      finalInputs.rawContent = `Hãy tự đề xuất một chủ đề thú vị đang trending và viết bài social media về chủ đề đó. Chọn chủ đề phù hợp với nền tảng ${options.platform || 'facebook'} và tone ${options.tone || 'engaging'}.`;
    }

    // Auto-select topic for English learning if needed
    if (selectedJob === 'english_learning' && options.autoSelect && !inputs.topic) {
      setGenerating(true);
      setResultMessage({
        type: 'loading',
        text: 'ChatGPT is picking a trending topic...'
      });

      const topicResult = await autoSelectTopic();

      if (topicResult.error) {
        setResultMessage({
          type: 'error',
          text: `Lỗi: ${topicResult.error}`
        });
        setGenerating(false);
        return;
      }

      finalInputs.topic = topicResult.topic;
      setInputs(prev => ({ ...prev, topic: topicResult.topic }));

      setResultMessage({
        type: 'loading',
        text: `Selected topic: ${topicResult.topic}. Sending prompt...`
      });

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Validate required inputs
    const missingRequired = job.inputs
      .filter(inp => inp.required && !finalInputs[inp.name])
      .map(inp => inp.label);

    if (missingRequired.length > 0) {
      showToast(`Thiếu: ${missingRequired.join(', ')}`, 'error');
      setGenerating(false);
      return;
    }

    setGenerating(true);
    setResultMessage({
      type: 'loading',
      text: 'Đang gửi prompt...'
    });

    currentJobRef.current = selectedJob;
    currentInputsRef.current = finalInputs;
    currentOptionsRef.current = options;

    const sendResult = await sendWritingJob(selectedJob, finalInputs, options);

    if (sendResult.error) {
      setResultMessage({
        type: 'error',
        text: `Lỗi: ${sendResult.error.message}`
      });
      setGenerating(false);
      return;
    }

    setResultMessage({
      type: 'loading',
      text: 'Đang chờ output...'
    });

    pollForResponse();
  };

  const handleCopy = async () => {
    if (!output?.content) return;

    const success = await copyToClipboard(output.content);
    showToast(success ? 'Đã copy!' : 'Copy thất bại', success ? 'success' : 'error');
  };

  const handleInsert = async () => {
    if (!output?.content) return;

    const success = await insertIntoActiveElement(output.content);
    if (success) {
      showToast('Đã insert!', 'success');
    } else {
      showToast('Insert thất bại, hãy copy thủ công', 'error');
      await copyToClipboard(output.content);
    }
  };

  const handleOpenChatGPT = async () => {
    if (!output?.chatUrl && !output?.chatId) {
      showToast('Không có chat URL', 'error');
      return;
    }

    const result = await openWritingChat(output.chatId);
    if (result.error) {
      showToast(`Lỗi: ${result.error.message}`, 'error');
    }
  };

  const handleHistoryOpen = async (chatUrl) => {
    try {
      const tabs = await chrome.tabs.query({ url: 'https://chatgpt.com/*' });
      if (tabs.length > 0) {
        await chrome.tabs.update(tabs[0].id, { url: chatUrl });
      } else {
        await chrome.tabs.create({ url: chatUrl });
      }
    } catch (error) {
      showToast('Không thể mở chat', 'error');
    }
  };

  const handleConfluenceUpload = async (content) => {
    if (!confluenceSpace) {
      showToast('Vui lòng nhập Space Key cho Confluence', 'error');
      return;
    }
    setConfluenceUploading(true);
    try {
      const title = confluenceTitle || `Writing - ${JOB_TYPES[selectedJob]?.label} - ${new Date().toLocaleString('vi-VN')}`;
      const storageContent = textToConfluenceStorage(content);
      const result = await createConfluencePage({
        spaceKey: confluenceSpace,
        title,
        content: storageContent
      });
      if (result.error) {
        showToast(`Upload Confluence thất bại: ${result.error.message}`, 'error');
      } else {
        showToast('Đã upload lên Confluence!', 'success');
        if (result.page?.url) {
          setResultMessage({
            type: 'success',
            text: `Đã upload lên Confluence! URL: ${result.page.url}`
          });
        }
      }
    } catch (error) {
      showToast(`Lỗi upload Confluence: ${error.message}`, 'error');
    } finally {
      setConfluenceUploading(false);
    }
  };

  const handleManualConfluenceUpload = async () => {
    if (output?.content) {
      await handleConfluenceUpload(output.content);
    }
  };

  const job = JOB_TYPES[selectedJob];

  return (
    <div class="page-container writing-page">
      {/* Header */}
      <div class="page-header">
        <h2>
          <i class="fas fa-pen-fancy"></i> Writing Assistant
        </h2>
        <div class="header-actions">
          <select
            class="job-dropdown"
            value={selectedJob}
            onChange={(e) => setSelectedJob(e.target.value)}
            disabled={generating}
          >
            {Object.values(JOB_TYPES).map(j => (
              <option key={j.id} value={j.id}>{j.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Content */}
      <div class="writing-container">
        {/* Left Panel: Form */}
        <div class="writing-panel writing-input-panel">

          {/* Input Fields */}
          <div class="job-form">
            <h4>Đầu vào:</h4>
            {job.inputs.map(input => (
              <div key={input.name} class="input-group">
                <label for={`input-${input.name}`}>
                  {input.label}
                  {input.required && <span class="required">*</span>}
                </label>
                {input.type === 'textarea' ? (
                  <textarea
                    id={`input-${input.name}`}
                    class="input-field textarea-field"
                    placeholder={input.placeholder}
                    value={inputs[input.name] || ''}
                    onInput={(e) => handleInputChange(input.name, e.target.value)}
                    disabled={generating}
                  />
                ) : (
                  <input
                    id={`input-${input.name}`}
                    type={input.type}
                    class="input-field"
                    placeholder={input.placeholder}
                    value={inputs[input.name] || ''}
                    onInput={(e) => handleInputChange(input.name, e.target.value)}
                    disabled={generating}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Options */}
          <div class="job-options">
            <h4>Tuỳ chọn:</h4>
            {job.options.map(opt => (
              <div key={opt.name} class="input-group">
                <label for={`option-${opt.name}`}>{opt.label}</label>
                {opt.type === 'select' ? (
                  <select
                    id={`option-${opt.name}`}
                    class="input-field"
                    value={options[opt.name] || opt.default}
                    onChange={(e) => handleOptionChange(opt.name, e.target.value)}
                    disabled={generating}
                  >
                    {opt.options.map(o => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                ) : opt.type === 'checkbox' ? (
                  <input
                    id={`option-${opt.name}`}
                    type="checkbox"
                    class="input-checkbox"
                    checked={options[opt.name] === true || options[opt.name] === 'true'}
                    onChange={(e) => handleOptionChange(opt.name, e.target.checked)}
                    disabled={generating}
                  />
                ) : opt.type === 'number' ? (
                  <input
                    id={`option-${opt.name}`}
                    type="number"
                    class="input-field"
                    value={options[opt.name] || opt.default}
                    onChange={(e) => handleOptionChange(opt.name, e.target.value)}
                    disabled={generating}
                  />
                ) : (
                  <input
                    id={`option-${opt.name}`}
                    type={opt.type}
                    class="input-field"
                    placeholder={opt.placeholder}
                    value={options[opt.name] || ''}
                    onChange={(e) => handleOptionChange(opt.name, e.target.value)}
                    disabled={generating}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Generate Button */}
          <button
            class="primary-btn generate-btn"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? (
              <><i class="fas fa-spinner fa-spin"></i> Processing...</>
            ) : (
              <><i class="fas fa-rocket"></i> Generate</>
            )}
          </button>

          {/* Confluence Upload Option */}
          <div class="confluence-upload-section">
            <div class="input-group">
              <label class="checkbox-inline">
                <input
                  type="checkbox"
                  checked={uploadToConfluence}
                  onChange={(e) => setUploadToConfluence(e.target.checked)}
                  disabled={generating}
                />
                <i class="fab fa-confluence"></i> Upload to Confluence sau khi hoàn thành
              </label>
            </div>
            {uploadToConfluence && (
              <div class="confluence-fields">
                <div class="input-group">
                  <label>Space Key <span class="required">*</span></label>
                  <input
                    type="text"
                    class="input-field"
                    placeholder="VD: DEV, TEAM, DOC"
                    value={confluenceSpace}
                    onInput={(e) => setConfluenceSpace(e.target.value)}
                    disabled={generating}
                  />
                </div>
                <div class="input-group">
                  <label>Tiêu đề trang (tùy chọn)</label>
                  <input
                    type="text"
                    class="input-field"
                    placeholder="Tự động sinh nếu để trống"
                    value={confluenceTitle}
                    onInput={(e) => setConfluenceTitle(e.target.value)}
                    disabled={generating}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Result Message */}
          {resultMessage && (
            <div class={`result-message ${resultMessage.type}`}>
              {resultMessage.text}
            </div>
          )}
        </div>

        {/* Right Panel: Output & History */}
        <div class="writing-panel writing-output-panel">
          {/* Tabs */}
          <div class="output-tabs">
            <button
              class={`tab-button ${activeTab === 'output' ? 'active' : ''}`}
              onClick={() => setActiveTab('output')}
            >
              Output
              {output && <span class="tab-badge">✓</span>}
            </button>
            <button
              class={`tab-button ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              History ({history.length})
            </button>
          </div>

          {/* Output Tab */}
          {activeTab === 'output' && (
            <div class="tab-content">
              {!output ? (
                <div class="empty-state">
                  <i class="fas fa-file-alt"></i>
                  <p>Không có output</p>
                  <small>Điền form và bấm Generate để tạo nội dung</small>
                </div>
              ) : (
                <div class="output-content">
                  <div class="output-text">
                    {output.content}
                  </div>

                  <div class="output-actions">
                    <button class="btn-action" onClick={handleCopy} title="Copy to clipboard">
                      <i class="fas fa-copy"></i> Copy
                    </button>
                    <button class="btn-action" onClick={handleInsert} title="Insert into active element">
                      <i class="fas fa-paste"></i> Insert
                    </button>
                    {output.chatUrl && (
                      <button class="btn-action" onClick={handleOpenChatGPT} title="Open in ChatGPT">
                        <i class="fas fa-external-link-alt"></i> Open Chat
                      </button>
                    )}
                    <button
                      class="btn-action"
                      onClick={handleManualConfluenceUpload}
                      disabled={confluenceUploading || !confluenceSpace}
                      title={confluenceSpace ? 'Upload to Confluence' : 'Nhập Space Key trước'}
                    >
                      {confluenceUploading ? (
                        <><i class="fas fa-spinner fa-spin"></i> Uploading...</>
                      ) : (
                        <><i class="fab fa-confluence"></i> Confluence</>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div class="tab-content">
              {history.length === 0 ? (
                <div class="empty-state">
                  <i class="fas fa-inbox"></i>
                  <p>Không có lịch sử</p>
                  <small>Tạo nội dung mới để xem lịch sử</small>
                </div>
              ) : (
                <div class="history-list">
                  {history.map((item) => (
                    <WritingHistoryItem
                      key={item.id}
                      item={item}
                      onOpen={handleHistoryOpen}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div class={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
