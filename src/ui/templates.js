const TEMPLATES_KEY = 'promptTemplates';

const DEFAULT_TEMPLATES = [
  {
    id: 'template_1',
    name: 'Stock Analysis',
    description: 'Analyze a stock with technical and fundamental analysis',
    content: 'Perform a comprehensive analysis of the stock {SYMBOL}:\n1. Technical Analysis (support/resistance, trends)\n2. Fundamental Analysis (P/E, ROE, debt)\n3. Sentiment Analysis (news, social media)\n4. Investment Recommendation (buy/hold/sell)',
    category: 'analysis',
    createdAt: new Date().toISOString()
  },
  {
    id: 'template_2',
    name: 'Portfolio Evaluation',
    description: 'Evaluate portfolio composition and diversity',
    content: 'Evaluate my portfolio:\n{PORTFOLIO}\n\nPlease analyze:\n1. Portfolio concentration risk\n2. Sector diversification\n3. Risk/reward balance\n4. Recommendations for rebalancing',
    category: 'portfolio',
    createdAt: new Date().toISOString()
  },
  {
    id: 'template_3',
    name: 'Risk Assessment',
    description: 'Assess risk for stock positions',
    content: 'Assess the risks for {SYMBOL}:\n1. Market risk factors\n2. Company-specific risks\n3. Regulatory risks\n4. Mitigation strategies',
    category: 'risk',
    createdAt: new Date().toISOString()
  },
  {
    id: 'template_4',
    name: 'Daily Summary',
    description: 'Generate daily market summary',
    content: 'Provide a daily market summary for Vietnamese stock market:\n1. Market overview (VN-Index, HNX)\n2. Top gainers/losers\n3. Volume analysis\n4. Key news and impact\n5. Tomorrow outlook',
    category: 'market',
    createdAt: new Date().toISOString()
  },
  {
    id: 'template_5',
    name: 'Code Review',
    description: 'Review and improve code',
    content: 'Review this code and suggest improvements:\n{CODE}\n\nFocus on:\n1. Code quality and readability\n2. Performance optimization\n3. Error handling\n4. Best practices\n5. Security concerns',
    category: 'coding',
    createdAt: new Date().toISOString()
  }
];

export async function initializeTemplates() {
  const stored = await chrome.storage.local.get(TEMPLATES_KEY);
  if (!stored[TEMPLATES_KEY]) {
    await chrome.storage.local.set({ [TEMPLATES_KEY]: DEFAULT_TEMPLATES });
    console.log('[Templates] Initialized with default templates');
  }
}

export async function getAllTemplates() {
  const stored = await chrome.storage.local.get(TEMPLATES_KEY);
  return stored[TEMPLATES_KEY] || [];
}

export async function getTemplate(id) {
  const templates = await getAllTemplates();
  return templates.find(t => t.id === id);
}

export async function saveTemplate(template) {
  const templates = await getAllTemplates();
  const index = templates.findIndex(t => t.id === template.id);
  
  if (index >= 0) {
    templates[index] = { ...template, updatedAt: new Date().toISOString() };
  } else {
    templates.push({ ...template, id: 'template_' + Date.now(), createdAt: new Date().toISOString() });
  }
  
  await chrome.storage.local.set({ [TEMPLATES_KEY]: templates });
  console.log('[Templates] Template saved:', template.id);
}

export async function deleteTemplate(id) {
  const templates = await getAllTemplates();
  const filtered = templates.filter(t => t.id !== id);
  await chrome.storage.local.set({ [TEMPLATES_KEY]: filtered });
  console.log('[Templates] Template deleted:', id);
}

export async function getTemplatesByCategory(category) {
  const templates = await getAllTemplates();
  return templates.filter(t => t.category === category);
}

export function setupTemplates(dom) {
  const { 
    promptInput, 
    templatesBtn, 
    templatesPage, 
    templateList, 
    newTemplateBtn,
    templateModal,
    closeTemplateModal,
    templateNameInput,
    templateDescInput,
    templateCategorySelect,
    templateContentInput,
    saveTemplateBtn,
    cancelTemplateBtn
  } = dom;

  if (!templateList) return;

  // Load and display templates
  async function loadTemplates() {
    const templates = await getAllTemplates();
    const categories = ['all', ...new Set(templates.map(t => t.category))];
    
    templateList.innerHTML = templates.map(t => `
      <div class="template-item" data-id="${t.id}">
        <div class="template-header">
          <h4>${t.name}</h4>
          <span class="template-category">${t.category}</span>
        </div>
        <p class="template-desc">${t.description}</p>
        <div class="template-actions">
          <button class="template-use-btn" data-id="${t.id}" title="Use this template"><i class="fas fa-thumbtack"></i> Use</button>
          <button class="template-edit-btn" data-id="${t.id}" title="Edit"><i class="fas fa-edit"></i> Edit</button>
          <button class="template-delete-btn" data-id="${t.id}" title="Delete"><i class="fas fa-trash"></i> Delete</button>
        </div>
      </div>
    `).join('');

    // Attach event listeners
    templateList.querySelectorAll('.template-use-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        const template = await getTemplate(id);
        if (template && promptInput) {
          promptInput.value = template.content;
          promptInput.focus();
        }
      });
    });

    templateList.querySelectorAll('.template-edit-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        const template = await getTemplate(id);
        if (template) {
          templateNameInput.value = template.name;
          templateDescInput.value = template.description;
          templateCategorySelect.value = template.category;
          templateContentInput.value = template.content;
          templateModal.dataset.editId = id;
          templateModal.classList.remove('hidden');
        }
      });
    });

    templateList.querySelectorAll('.template-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        if (confirm('Delete this template?')) {
          await deleteTemplate(id);
          loadTemplates();
        }
      });
    });
  }

  // New template button
  newTemplateBtn?.addEventListener('click', () => {
    templateNameInput.value = '';
    templateDescInput.value = '';
    templateCategorySelect.value = 'analysis';
    templateContentInput.value = '';
    delete templateModal.dataset.editId;
    templateModal.classList.remove('hidden');
  });

  // Close modal
  closeTemplateModal?.addEventListener('click', () => {
    templateModal.classList.add('hidden');
  });

  cancelTemplateBtn?.addEventListener('click', () => {
    templateModal.classList.add('hidden');
  });

  // Save template
  saveTemplateBtn?.addEventListener('click', async () => {
    const name = templateNameInput.value.trim();
    const description = templateDescInput.value.trim();
    const category = templateCategorySelect.value;
    const content = templateContentInput.value.trim();

    if (!name || !content) {
      alert('Name and Content are required!');
      return;
    }

    const editId = templateModal.dataset.editId;
    const template = {
      id: editId || 'template_' + Date.now(),
      name,
      description,
      category,
      content
    };

    await saveTemplate(template);
    templateModal.classList.add('hidden');
    loadTemplates();
  });

  // Initial load
  loadTemplates();
}
