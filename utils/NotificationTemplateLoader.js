/**
 * NotificationTemplateLoader
 * Loads and manages notification templates for the NotificationsAccount system
 */

const fs = require('fs').promises;
const { pathToFileURL } = require('url');
const path = require('path');

class NotificationTemplateLoader {
  static #templates = new Map();
  static #initialized = false;

  /**
   * Initialize template loader with configuration file
   * @param {string} configPath - Path to template configuration file
   */
  static async initialize(configPath = null) {
    if (NotificationTemplateLoader.#initialized) {
      return;
    }

    const templatePath = configPath || path.join(process.cwd(), 'config', 'notification-templates.json');
    
    try {
      console.log(`📁 Loading notification templates from: ${templatePath}`);
      const templates = await NotificationTemplateLoader.#loadTemplatesFromFile(templatePath);
      
      // Store templates in Map for fast lookup
      for (const template of templates) {
        if (template.template_id) {
          NotificationTemplateLoader.#templates.set(template.template_id, template);
        }
      }

      console.log(`✅ Loaded ${NotificationTemplateLoader.#templates.size} notification templates`);
      NotificationTemplateLoader.#initialized = true;

    } catch (error) {
      console.error("❌ Failed to load notification templates:", error.message);
      throw new Error(`Template loader initialization failed: ${error.message}`);
    }
  }

  /**
   * Get template by ID
   * @param {string} templateId - Template identifier
   * @returns {Object|null} Template configuration or null if not found
   */
  static async getTemplate(templateId) {
    if (!NotificationTemplateLoader.#initialized) {
      await NotificationTemplateLoader.initialize();
    }

    const template = NotificationTemplateLoader.#templates.get(templateId);
    if (!template) {
      console.warn(`⚠️  Template not found: ${templateId}`);
      return null;
    }

    // Return a deep copy to prevent modifications
    return JSON.parse(JSON.stringify(template.defaults));
  }

  /**
   * Get all available template IDs
   * @returns {string[]} Array of template IDs
   */
  static getAvailableTemplates() {
    return Array.from(NotificationTemplateLoader.#templates.keys());
  }

  /**
   * Check if template exists
   * @param {string} templateId - Template identifier
   * @returns {boolean} True if template exists
   */
  static hasTemplate(templateId) {
    return NotificationTemplateLoader.#templates.has(templateId);
  }

  /**
   * Get template statistics
   * @returns {Object} Template statistics
   */
  static getStats() {
    const categories = new Map();
    const types = new Map();
    let totalTemplates = 0;

    for (const [id, template] of NotificationTemplateLoader.#templates) {
      totalTemplates++;
      
      const category = template.defaults?.category || 'unknown';
      const type = template.defaults?.type || 'unknown';
      
      categories.set(category, (categories.get(category) || 0) + 1);
      types.set(type, (types.get(type) || 0) + 1);
    }

    return {
      totalTemplates,
      categories: Object.fromEntries(categories),
      types: Object.fromEntries(types),
      templateIds: Array.from(NotificationTemplateLoader.#templates.keys())
    };
  }

  /**
   * Reload templates from file
   * @param {string} configPath - Path to template configuration file
   */
  static async reload(configPath = null) {
    NotificationTemplateLoader.#templates.clear();
    NotificationTemplateLoader.#initialized = false;
    await NotificationTemplateLoader.initialize(configPath);
  }

  /**
   * Add template dynamically
   * @param {Object} template - Template configuration
   */
  static addTemplate(template) {
    if (!template.template_id) {
      throw new Error("Template must have a template_id");
    }

    if (!template.defaults) {
      throw new Error("Template must have defaults object");
    }

    NotificationTemplateLoader.#templates.set(template.template_id, template);
    console.log(`✅ Added template: ${template.template_id}`);
  }

  /**
   * Remove template
   * @param {string} templateId - Template identifier
   */
  static removeTemplate(templateId) {
    const removed = NotificationTemplateLoader.#templates.delete(templateId);
    if (removed) {
      console.log(`🗑️  Removed template: ${templateId}`);
    }
    return removed;
  }

  /**
   * Load templates from file
   * @private
   */
  static async #loadTemplatesFromFile(filePath) {
    try {
      const ext = path.extname(filePath).toLowerCase();
      
      if (ext === '.json') {
        const content = await fs.readFile(filePath, 'utf8');
        return JSON.parse(content);
      } else if (ext === '.js' || ext === '.mjs') {
        const module = await import(pathToFileURL(filePath).href);
        return module.default || module;
      } else {
        throw new Error(`Unsupported file extension: ${ext}`);
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Template file not found: ${filePath}`);
      }
      throw new Error(`Failed to load template file: ${error.message}`);
    }
  }

  /**
   * Validate template configuration
   * @private
   */
  static #validateTemplate(template) {
    if (!template.template_id) {
      return { valid: false, error: "Missing template_id" };
    }

    if (!template.defaults) {
      return { valid: false, error: "Missing defaults object" };
    }

    const required = ['category', 'title', 'description'];
    for (const field of required) {
      if (!template.defaults[field]) {
        return { valid: false, error: `Missing required field: ${field}` };
      }
    }

    return { valid: true };
  }

  /**
   * Clear all templates (for testing)
   */
  static clear() {
    NotificationTemplateLoader.#templates.clear();
    NotificationTemplateLoader.#initialized = false;
    console.log("🧹 Cleared all templates");
  }
}

// Export the template loader function for NotificationsAccount
const templateLoader = async (templateId) => {
  return await NotificationTemplateLoader.getTemplate(templateId);
};
module.exports = NotificationTemplateLoader;
module.exports.templateLoader = templateLoader;
