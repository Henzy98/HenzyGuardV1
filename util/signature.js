function validateHenzySignature(configObj, varName) {
    if (!configObj || typeof configObj !== 'object') {
        console.error('[HENZY-GUARD] Invalid configuration object');
        process.exit(1);
    }

    if (configObj._henzySignature !== 'HENZY_GUARD_FRAMEWORK_V1_PROTECTED') {
        console.error('[HENZY-GUARD] Configuration signature mismatch');
        process.exit(1);
    }

    if (configObj._requireHenzyVar && varName !== 'henzy') {
        console.error('[HENZY-GUARD] Configuration must be loaded as "henzy"');
        process.exit(1);
    }

    return true;
}

module.exports = { validateHenzySignature };
