/**
 * Atlassian Handler - Jira & Confluence integration
 * Communicates with Atlassian REST APIs using credentials stored in user settings
 * 
 * Architecture: UI → Background Handler → Atlassian REST API
 * Credentials stored in Supabase settings table (config.atlassian)
 */

import { supabase } from '../../supabaseConfig.js';
import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { createLogger } from '../../logger.js';
import { requireAuth } from '../utils/auth.js';
import { supabaseWithRetry } from '../utils/supabaseRetry.js';
import { ERROR_CODES, getUserFriendlyMessage } from '../../shared/errorCodes.js';

const logger = createLogger('Atlassian');

/**
 * Get Atlassian credentials from user settings
 */
async function getAtlassianCredentials(userId) {
  const { data, error } = await supabase
    .from('settings')
    .select('config')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;

  const atlassian = data?.config?.atlassian;
  if (!atlassian?.baseUrl || !atlassian?.email || !atlassian?.apiToken) {
    throw {
      errorCode: ERROR_CODES.INVALID_INPUT,
      message: 'Chưa cấu hình Atlassian. Vui lòng cập nhật trong Settings.'
    };
  }

  return atlassian;
}

/**
 * Make an authenticated Atlassian API request
 */
async function atlassianFetch(credentials, path, options = {}) {
  const { baseUrl, email, apiToken } = credentials;
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;
  
  const headers = {
    'Authorization': `Basic ${btoa(`${email}:${apiToken}`)}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...options.headers
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Atlassian API error ${response.status}: ${errorBody}`);
  }

  // Some DELETE responses have no body
  if (response.status === 204) return { success: true };
  
  return response.json();
}

// ============================================================
// JIRA HANDLERS
// ============================================================

/**
 * ATLASSIAN_JIRA_GET_PROJECTS - Get Jira projects
 */
registerHandler(MESSAGE_TYPES.ATLASSIAN_JIRA_GET_PROJECTS, async (message) => {
  const correlationId = logger.startOperation('jiraGetProjects', message.correlationId);
  try {
    const userId = await requireAuth(message);
    const credentials = await getAtlassianCredentials(userId);

    const data = await atlassianFetch(credentials, '/rest/api/3/project');
    const projects = data.map(p => ({
      id: p.id,
      key: p.key,
      name: p.name,
      projectTypeKey: p.projectTypeKey
    }));

    logger.endOperation(correlationId, 'success');
    return createResponse(message, MESSAGE_TYPES.ATLASSIAN_JIRA_PROJECTS_DATA, {
      success: true,
      projects
    });
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });
    if (error.errorCode) {
      return createErrorResponse(message, error.errorCode, error.message);
    }
    return createErrorResponse(message, ERROR_CODES.SUPABASE_ERROR, error.message);
  }
});

/**
 * ATLASSIAN_JIRA_GET_ISSUES - Get Jira issues with JQL
 */
registerHandler(MESSAGE_TYPES.ATLASSIAN_JIRA_GET_ISSUES, async (message) => {
  const correlationId = logger.startOperation('jiraGetIssues', message.correlationId);
  try {
    const userId = await requireAuth(message);
    const credentials = await getAtlassianCredentials(userId);
    const { jql, maxResults = 50, startAt = 0, projectKey } = message.data || {};

    let query = jql || '';
    if (!query && projectKey) {
      query = `project = "${projectKey}" ORDER BY updated DESC`;
    }
    if (!query) {
      query = 'assignee = currentUser() ORDER BY updated DESC';
    }

    const params = new URLSearchParams({
      jql: query,
      maxResults: String(maxResults),
      startAt: String(startAt),
      fields: 'summary,status,assignee,priority,issuetype,created,updated,description'
    });

    const data = await atlassianFetch(credentials, `/rest/api/3/search/jql?${params}`);
    const issues = (data.issues || []).map(issue => ({
      id: issue.id,
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status?.name,
      statusCategory: issue.fields.status?.statusCategory?.key,
      assignee: issue.fields.assignee?.displayName,
      priority: issue.fields.priority?.name,
      issueType: issue.fields.issuetype?.name,
      created: issue.fields.created,
      updated: issue.fields.updated,
      description: issue.fields.description
    }));

    logger.endOperation(correlationId, 'success');
    return createResponse(message, MESSAGE_TYPES.ATLASSIAN_JIRA_ISSUES_DATA, {
      success: true,
      issues,
      total: data.total,
      maxResults: data.maxResults,
      startAt: data.startAt
    });
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });
    if (error.errorCode) {
      return createErrorResponse(message, error.errorCode, error.message);
    }
    return createErrorResponse(message, ERROR_CODES.SUPABASE_ERROR, error.message);
  }
});

/**
 * ATLASSIAN_JIRA_CREATE_ISSUE - Create a new Jira issue
 */
registerHandler(MESSAGE_TYPES.ATLASSIAN_JIRA_CREATE_ISSUE, async (message) => {
  const correlationId = logger.startOperation('jiraCreateIssue', message.correlationId);
  try {
    const userId = await requireAuth(message);
    const credentials = await getAtlassianCredentials(userId);
    const { projectKey, summary, description, issueType = 'Task', priority, assignee } = message.data || {};

    if (!projectKey || !summary) {
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, 'Project key và summary là bắt buộc.');
    }

    const body = {
      fields: {
        project: { key: projectKey },
        summary,
        description: description || '',
        issuetype: { name: issueType }
      }
    };
    if (priority) body.fields.priority = { name: priority };
    if (assignee) body.fields.assignee = { name: assignee };

    const data = await atlassianFetch(credentials, '/rest/api/3/issue', {
      method: 'POST',
      body: JSON.stringify(body)
    });

    logger.endOperation(correlationId, 'success');
    return createResponse(message, MESSAGE_TYPES.ATLASSIAN_JIRA_ISSUE_CREATED, {
      success: true,
      issue: { id: data.id, key: data.key, self: data.self }
    });
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });
    if (error.errorCode) {
      return createErrorResponse(message, error.errorCode, error.message);
    }
    return createErrorResponse(message, ERROR_CODES.SUPABASE_ERROR, error.message);
  }
});

/**
 * ATLASSIAN_JIRA_UPDATE_ISSUE - Update a Jira issue
 */
registerHandler(MESSAGE_TYPES.ATLASSIAN_JIRA_UPDATE_ISSUE, async (message) => {
  const correlationId = logger.startOperation('jiraUpdateIssue', message.correlationId);
  try {
    const userId = await requireAuth(message);
    const credentials = await getAtlassianCredentials(userId);
    const { issueKey, summary, description, status, priority, assignee } = message.data || {};

    if (!issueKey) {
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, 'Issue key là bắt buộc.');
    }

    const fields = {};
    if (summary) fields.summary = summary;
    if (description !== undefined) fields.description = description;
    if (priority) fields.priority = { name: priority };
    if (assignee) fields.assignee = { name: assignee };

    if (Object.keys(fields).length > 0) {
      await atlassianFetch(credentials, `/rest/api/3/issue/${issueKey}`, {
        method: 'PUT',
        body: JSON.stringify({ fields })
      });
    }

    // Handle status transitions separately
    if (status) {
      try {
        const transitions = await atlassianFetch(credentials, `/rest/api/3/issue/${issueKey}/transitions`);
        const transition = transitions.transitions?.find(t => 
          t.name.toLowerCase() === status.toLowerCase() || 
          t.to?.name?.toLowerCase() === status.toLowerCase()
        );
        if (transition) {
          await atlassianFetch(credentials, `/rest/api/3/issue/${issueKey}/transitions`, {
            method: 'POST',
            body: JSON.stringify({ transition: { id: transition.id } })
          });
        }
      } catch (e) {
        logger.warn('Could not transition issue status', e.message);
      }
    }

    logger.endOperation(correlationId, 'success');
    return createResponse(message, MESSAGE_TYPES.ATLASSIAN_JIRA_ISSUE_UPDATED, {
      success: true,
      issueKey
    });
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });
    if (error.errorCode) {
      return createErrorResponse(message, error.errorCode, error.message);
    }
    return createErrorResponse(message, ERROR_CODES.SUPABASE_ERROR, error.message);
  }
});

/**
 * ATLASSIAN_JIRA_DELETE_ISSUE - Delete a Jira issue
 */
registerHandler(MESSAGE_TYPES.ATLASSIAN_JIRA_DELETE_ISSUE, async (message) => {
  const correlationId = logger.startOperation('jiraDeleteIssue', message.correlationId);
  try {
    const userId = await requireAuth(message);
    const credentials = await getAtlassianCredentials(userId);
    const { issueKey } = message.data || {};

    if (!issueKey) {
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, 'Issue key là bắt buộc.');
    }

    await atlassianFetch(credentials, `/rest/api/3/issue/${issueKey}`, {
      method: 'DELETE'
    });

    logger.endOperation(correlationId, 'success');
    return createResponse(message, MESSAGE_TYPES.ATLASSIAN_JIRA_ISSUE_DELETED, {
      success: true,
      issueKey
    });
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });
    if (error.errorCode) {
      return createErrorResponse(message, error.errorCode, error.message);
    }
    return createErrorResponse(message, ERROR_CODES.SUPABASE_ERROR, error.message);
  }
});

// ============================================================
// CONFLUENCE HANDLERS
// ============================================================

/**
 * ATLASSIAN_CONFLUENCE_GET_PAGES - Search/list Confluence pages
 */
registerHandler(MESSAGE_TYPES.ATLASSIAN_CONFLUENCE_GET_PAGES, async (message) => {
  const correlationId = logger.startOperation('confluenceGetPages', message.correlationId);
  try {
    const userId = await requireAuth(message);
    const credentials = await getAtlassianCredentials(userId);
    const { spaceKey, title, limit = 25 } = message.data || {};

    let path = '/rest/api/content?type=page&expand=version,space';
    if (spaceKey) path += `&spaceKey=${encodeURIComponent(spaceKey)}`;
    if (title) path += `&title=${encodeURIComponent(title)}`;
    path += `&limit=${limit}`;

    const data = await atlassianFetch(credentials, path);
    const pages = (data.results || []).map(page => ({
      id: page.id,
      title: page.title,
      spaceKey: page.space?.key,
      spaceName: page.space?.name,
      version: page.version?.number,
      url: page._links?.webui ? `${credentials.baseUrl}${page._links.webui}` : null
    }));

    logger.endOperation(correlationId, 'success');
    return createResponse(message, MESSAGE_TYPES.ATLASSIAN_CONFLUENCE_PAGES_DATA, {
      success: true,
      pages,
      total: data.size
    });
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });
    if (error.errorCode) {
      return createErrorResponse(message, error.errorCode, error.message);
    }
    return createErrorResponse(message, ERROR_CODES.SUPABASE_ERROR, error.message);
  }
});

/**
 * ATLASSIAN_CONFLUENCE_GET_PAGE - Get single page content
 */
registerHandler(MESSAGE_TYPES.ATLASSIAN_CONFLUENCE_GET_PAGE, async (message) => {
  const correlationId = logger.startOperation('confluenceGetPage', message.correlationId);
  try {
    const userId = await requireAuth(message);
    const credentials = await getAtlassianCredentials(userId);
    const { pageId } = message.data || {};

    if (!pageId) {
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, 'Page ID là bắt buộc.');
    }

    const data = await atlassianFetch(credentials, `/rest/api/content/${pageId}?expand=body.storage,version,space`);

    logger.endOperation(correlationId, 'success');
    return createResponse(message, MESSAGE_TYPES.ATLASSIAN_CONFLUENCE_PAGE_DATA, {
      success: true,
      page: {
        id: data.id,
        title: data.title,
        spaceKey: data.space?.key,
        content: data.body?.storage?.value,
        version: data.version?.number,
        url: data._links?.webui ? `${credentials.baseUrl}${data._links.webui}` : null
      }
    });
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });
    if (error.errorCode) {
      return createErrorResponse(message, error.errorCode, error.message);
    }
    return createErrorResponse(message, ERROR_CODES.SUPABASE_ERROR, error.message);
  }
});

/**
 * ATLASSIAN_CONFLUENCE_CREATE_PAGE - Create a new Confluence page
 */
registerHandler(MESSAGE_TYPES.ATLASSIAN_CONFLUENCE_CREATE_PAGE, async (message) => {
  const correlationId = logger.startOperation('confluenceCreatePage', message.correlationId);
  try {
    const userId = await requireAuth(message);
    const credentials = await getAtlassianCredentials(userId);
    const { spaceKey, title, content, parentId } = message.data || {};

    if (!spaceKey || !title || !content) {
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, 'Space key, title và content là bắt buộc.');
    }

    const body = {
      type: 'page',
      title,
      space: { key: spaceKey },
      body: {
        storage: {
          value: content,
          representation: 'storage'
        }
      }
    };

    if (parentId) {
      body.ancestors = [{ id: parentId }];
    }

    const data = await atlassianFetch(credentials, '/rest/api/content', {
      method: 'POST',
      body: JSON.stringify(body)
    });

    logger.endOperation(correlationId, 'success');
    return createResponse(message, MESSAGE_TYPES.ATLASSIAN_CONFLUENCE_PAGE_CREATED, {
      success: true,
      page: {
        id: data.id,
        title: data.title,
        url: data._links?.webui ? `${credentials.baseUrl}${data._links.webui}` : null
      }
    });
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });
    if (error.errorCode) {
      return createErrorResponse(message, error.errorCode, error.message);
    }
    return createErrorResponse(message, ERROR_CODES.SUPABASE_ERROR, error.message);
  }
});

/**
 * ATLASSIAN_CONFLUENCE_UPDATE_PAGE - Update existing Confluence page
 */
registerHandler(MESSAGE_TYPES.ATLASSIAN_CONFLUENCE_UPDATE_PAGE, async (message) => {
  const correlationId = logger.startOperation('confluenceUpdatePage', message.correlationId);
  try {
    const userId = await requireAuth(message);
    const credentials = await getAtlassianCredentials(userId);
    const { pageId, title, content, version } = message.data || {};

    if (!pageId || !title || !content) {
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, 'Page ID, title và content là bắt buộc.');
    }

    // Get current version if not provided
    let nextVersion = version;
    if (!nextVersion) {
      const currentPage = await atlassianFetch(credentials, `/rest/api/content/${pageId}?expand=version`);
      nextVersion = (currentPage.version?.number || 0) + 1;
    }

    const body = {
      type: 'page',
      title,
      body: {
        storage: {
          value: content,
          representation: 'storage'
        }
      },
      version: { number: nextVersion }
    };

    const data = await atlassianFetch(credentials, `/rest/api/content/${pageId}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });

    logger.endOperation(correlationId, 'success');
    return createResponse(message, MESSAGE_TYPES.ATLASSIAN_CONFLUENCE_PAGE_UPDATED, {
      success: true,
      page: {
        id: data.id,
        title: data.title,
        url: data._links?.webui ? `${credentials.baseUrl}${data._links.webui}` : null
      }
    });
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });
    if (error.errorCode) {
      return createErrorResponse(message, error.errorCode, error.message);
    }
    return createErrorResponse(message, ERROR_CODES.SUPABASE_ERROR, error.message);
  }
});

/**
 * ATLASSIAN_TEST_CONNECTION - Test Atlassian connection
 */
registerHandler(MESSAGE_TYPES.ATLASSIAN_TEST_CONNECTION, async (message) => {
  const correlationId = logger.startOperation('atlassianTestConnection', message.correlationId);
  try {
    const userId = await requireAuth(message);
    const credentials = await getAtlassianCredentials(userId);

    // Test Jira connection
    const myself = await atlassianFetch(credentials, '/rest/api/3/myself');

    logger.endOperation(correlationId, 'success');
    return createResponse(message, MESSAGE_TYPES.ATLASSIAN_CONNECTION_STATUS, {
      success: true,
      connected: true,
      user: {
        displayName: myself.displayName,
        emailAddress: myself.emailAddress
      }
    });
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });
    return createResponse(message, MESSAGE_TYPES.ATLASSIAN_CONNECTION_STATUS, {
      success: false,
      connected: false,
      error: error.message
    });
  }
});
