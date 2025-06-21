const crypto = require('crypto');
const path = require('path');

/**
 * Generate a unique, safe filename while preserving extension
 * Format: timestamp_randomHash.extension
 */
const generateUniqueFilename = (originalFilename) => {
  if (!originalFilename || typeof originalFilename !== 'string') {
    return `file_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  // Extract extension safely
  const ext = path.extname(originalFilename).toLowerCase();
  
  // Generate unique identifier
  const timestamp = Date.now();
  const randomHash = crypto.randomBytes(12).toString('hex'); // 24 characters
  
  // Create unique filename: timestamp_hash.ext
  const uniqueFilename = `${timestamp}_${randomHash}${ext}`;
  
  return uniqueFilename;
};

/**
 * Enhanced sanitization for display names (not for file storage)
 */
const sanitizeDisplayName = (filename) => {
  if (!filename || typeof filename !== 'string') {
    return 'unnamed_file';
  }

  // ✅ COMPREHENSIVE SANITIZATION FOR YOUR PROBLEMATIC FILENAME
  let sanitized = filename
    // Remove path traversal attempts
    .replace(/\.\./g, '')
    .replace(/[\/\\]/g, '_')
    // Remove dangerous characters but keep useful ones
    .replace(/[<>:"|?*\x00-\x1f]/g, '_')
    // Handle your specific problematic characters
    .replace(/\(/g, '_')  // Opening parenthesis
    .replace(/\)/g, '_')  // Closing parenthesis  
    .replace(/\[/g, '_')  // Opening bracket
    .replace(/\]/g, '_')  // Closing bracket
    .replace(/\{/g, '_')  // Opening brace
    .replace(/\}/g, '_')  // Closing brace
    .replace(/'/g, '_')   // Single quotes
    .replace(/"/g, '_')   // Double quotes
    .replace(/`/g, '_')   // Backticks
    .replace(/\$/g, '_')  // Dollar signs
    .replace(/&/g, '_')   // Ampersands
    .replace(/;/g, '_')   // Semicolons
    .replace(/\|/g, '_')  // Pipes
    .replace(/~/g, '_')   // Tildes
    .replace(/#/g, '_')   // Hash symbols
    .replace(/%/g, '_')   // Percent signs
    .replace(/\+/g, '_')  // Plus signs
    .replace(/=/g, '_')   // Equal signs
    .replace(/\s+/g, '_') // Multiple spaces to single underscore
    .replace(/_+/g, '_')  // Multiple underscores to single
    // Remove leading/trailing underscores and dots
    .replace(/^[_\.]+/, '')
    .replace(/[_\.]+$/, '')
    // Limit length
    .substring(0, 200);

  // Ensure we have a valid name
  if (!sanitized || sanitized.length === 0) {
    sanitized = `file_${Date.now()}`;
  }

  return sanitized;
};

module.exports = {
  generateUniqueFilename,
  sanitizeDisplayName
};