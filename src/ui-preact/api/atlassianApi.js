/**
 * Atlassian API - UI communication layer for Jira & Confluence
 * Routes operations to background handlers via runtimeGateway.
 */

import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { sendRuntimeMessage } from './runtimeGateway.js';

/**
 * Helper to send message to background
 */
async function sendMessage(type, data = {}) {
  try {
    const response = await sendRuntimeMessage(type, { data });

    if (response?.error) {
      return { error: response.error };
    }
    return response;
  } catch (error) {
    console.error(`[AtlassianAPI] ${type} failed:`, error);
    return { error: { message: error.message || 'Lỗi kết nối' } };
  }
}

// ============================================================
// JIRA API
// ============================================================

/**
 * Get Jira projects
 */
export async function getJiraProjects() {
  return sendMessage(MESSAGE_TYPES.ATLASSIAN_JIRA_GET_PROJECTS);
}

/**
 * Get Jira issues
 * @param {Object} options - { jql, maxResults, startAt, projectKey }
 */
export async function getJiraIssues(options = {}) {
  return sendMessage(MESSAGE_TYPES.ATLASSIAN_JIRA_GET_ISSUES, options);
}

/**
 * Create a Jira issue
 * @param {Object} data - { projectKey, summary, description, issueType, priority, assignee }
 */
export async function createJiraIssue(data) {
  return sendMessage(MESSAGE_TYPES.ATLASSIAN_JIRA_CREATE_ISSUE, data);
}

/**
 * Update a Jira issue
 * @param {Object} data - { issueKey, summary, description, status, priority, assignee }
 */
export async function updateJiraIssue(data) {
  return sendMessage(MESSAGE_TYPES.ATLASSIAN_JIRA_UPDATE_ISSUE, data);
}

/**
 * Delete a Jira issue
 * @param {string} issueKey
 */
export async function deleteJiraIssue(issueKey) {
  return sendMessage(MESSAGE_TYPES.ATLASSIAN_JIRA_DELETE_ISSUE, { issueKey });
}

// ============================================================
// CONFLUENCE API
// ============================================================

/**
 * Get/search Confluence pages
 * @param {Object} options - { spaceKey, title, limit }
 */
export async function getConfluencePages(options = {}) {
  return sendMessage(MESSAGE_TYPES.ATLASSIAN_CONFLUENCE_GET_PAGES, options);
}

/**
 * Get a single Confluence page content
 * @param {string} pageId
 */
export async function getConfluencePage(pageId) {
  return sendMessage(MESSAGE_TYPES.ATLASSIAN_CONFLUENCE_GET_PAGE, { pageId });
}

/**
 * Create a Confluence page
 * @param {Object} data - { spaceKey, title, content, parentId }
 */
export async function createConfluencePage(data) {
  return sendMessage(MESSAGE_TYPES.ATLASSIAN_CONFLUENCE_CREATE_PAGE, data);
}

/**
 * Update a Confluence page
 * @param {Object} data - { pageId, title, content, version }
 */
export async function updateConfluencePage(data) {
  return sendMessage(MESSAGE_TYPES.ATLASSIAN_CONFLUENCE_UPDATE_PAGE, data);
}

/**
 * Test Atlassian connection
 */
export async function testAtlassianConnection() {
  return sendMessage(MESSAGE_TYPES.ATLASSIAN_TEST_CONNECTION);
}

/**
 * Convert plain text / markdown to Confluence storage format (basic conversion)
 * For simple content - wraps text in paragraphs
 */
export function textToConfluenceStorage(text) {
  if (!text) return '';
  
  // Split by double newlines for paragraphs
  const paragraphs = text.split(/\n\n+/);
  return paragraphs
    .map(p => {
      // Convert single newlines to <br/>
      const content = p.trim().replace(/\n/g, '<br/>');
      if (!content) return '';
      
      // Detect headings (# Heading)
      const headingMatch = content.match(/^(#{1,6})\s+(.+)/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        return `<h${level}>${headingMatch[2]}</h${level}>`;
      }

      return `<p>${content}</p>`;
    })
    .filter(Boolean)
    .join('\n');
}
