/* Flame Chick POS V3 catalog projection.
 * Source of truth: immutable published catalog snapshots from the database.
 * The returned rows are display projections only; IDs and selections remain V3 IDs.
 */
(function(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlameChickPosCatalogV3 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function fail(code, message) { return { ok: false, code, message }; }
  function isRecord(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function activeBranch(snapshot, requestedBranchId) {
    const branches = Array.isArray(snapshot.branches) ? snapshot.branches : [];
    if (requestedBranchId) return branches.find(row => row.branchId === requestedBranchId) || null;
    return branches.length === 1 ? branches[0] : null;
  }

  function adapt(snapshot, options) {
    options = options || {};
    const contract = options.contract || (typeof globalThis !== 'undefined' && globalThis.FlameChickCatalogV3);
    const dealView = options.dealView || (typeof globalThis !== 'undefined' && globalThis.FlameChickCatalogV3DealView);
    if (!isRecord(snapshot) || snapshot.schemaVersion !== 3) {
      return fail('CATALOG_SCHEMA_UNSUPPORTED', 'The POS requires a published V3 Flame Chick catalog.');
    }
    if (!contract || typeof contract.validateSnapshot !== 'function' ||
        !dealView || typeof dealView.buildDealViewModel !== 'function' ||
        typeof dealView.buildProductModifierGroups !== 'function') {
      return fail('CATALOG_RUNTIME_UNAVAILABLE', 'The V3 catalog validation and deal modules are unavailable.');
    }
    const checked = contract.validateSnapshot(snapshot);
    if (!checked || checked.ok !== true) {
      return fail(checked && checked.code || 'CATALOG_INVALID', 'The published V3 catalog failed validation.');
    }
    const branch = activeBranch(snapshot, options.branchId);
    if (!branch || typeof branch.branchId !== 'string') {
      return fail('CATALOG_BRANCH_REQUIRED', 'Select a valid branch before loading the POS catalog.');
    }
    const databaseNow = snapshot.databaseNow;
    if (!databaseNow || !Number.isFinite(new Date(databaseNow).getTime())) {
      return fail('CATALOG_DATABASE_TIME_REQUIRED', 'The V3 catalog did not provide a valid database timestamp.');
    }

    const categories = snapshot.categories.map(row => ({
      ID: String(row.categoryId),
      Name: String(row.nameEn || ''),
      NameUr: String(row.nameUr || ''),
      ImageCurrentPath: String(row.imageCurrentPath || ''),
      ImagePublished: row.imagePublished === true,
      SortOrder: Number(row.sortOrder) || 0,
      CategoryKind: String(row.categoryKind || 'menu'),
      Active: true
    }));
    const categoryIds = new Set(categories.map(row => row.ID));
    const subcategories = snapshot.subcategories.map(row => ({
      SubcategoryID: String(row.subcategoryId),
      CategoryID: String(row.categoryId),
      Name: String(row.nameEn || ''),
      NameEn: String(row.nameEn || ''),
      NameUr: String(row.nameUr || ''),
      SortOrder: Number(row.sortOrder) || 0,
      Active: true
    }));
    const productById = new Map(snapshot.products.map(row => [String(row.productId), row]));
    const menu = [];
    const variantById = new Map();

    for (const variant of snapshot.productVariants) {
      const product = productById.get(String(variant.productId));
      if (!product || !categoryIds.has(String(product.categoryId))) continue;
      const branchAvailable = contract.resolveProductAvailability(snapshot, branch.branchId, product.productId) &&
        contract.resolveVariantAvailability(snapshot, branch.branchId, product.productId, variant.variantId);
      const price = variant.price === null || variant.price === undefined ? null : Number(variant.price);
      const sellable = product.available === true && variant.available === true &&
        variant.standaloneSellable === true && branchAvailable &&
        price !== null && Number.isFinite(price) && price >= 0;
      if (!sellable) continue;
      const row = {
        ID: String(variant.variantId),
        VariantID: String(variant.variantId),
        ProductID: String(product.productId),
        CategoryID: String(product.categoryId),
        SubcategoryID: product.subcategoryId ? String(product.subcategoryId) : '',
        Name: String(product.nameEn || ''),
        NameUr: String(product.nameUr || ''),
        ImageCurrentPath: product.imagePublished === true ? String(product.imageCurrentPath || '') : '',
        ImagePublished: product.imagePublished === true,
        ImageFolderKey: String(product.imageFolderKey || ''),
        ImageGroupID: String(product.imageGroupId || ''),
        ImageExtension: String(product.imageExtension || ''),
        Description: String(variant.sizeLabel || product.descriptionEn || ''),
        DescriptionUr: String(product.descriptionUr || ''),
        Price: price,
        SizeKey: String(variant.sizeKey || ''),
        Available: true,
        Active: true,
        Featured: product.featured === true,
        SortOrder: (Number(product.sortOrder) || 0) * 1000 + (Number(variant.sortOrder) || 0),
        SchemaVersion: 3,
        CatalogPublicationId: snapshot.publicationId,
        CatalogVersion: snapshot.publicationNumber
      };
      menu.push(row);
      variantById.set(row.ID, row);
    }
    menu.sort((a, b) => a.SortOrder - b.SortOrder || a.Name.localeCompare(b.Name) || a.ID.localeCompare(b.ID));
    if (!menu.length) return fail('CATALOG_NO_SELLABLE_PRODUCTS', 'The published V3 catalog has no available standalone product variants.');

    const dealResult = dealView.buildDealViewModel(snapshot, {
      branchId: branch.branchId,
      fulfilmentType: options.fulfilmentType || 'dine_in',
      databaseNow,
      staffPos: true
    }, contract);
    if (!dealResult || dealResult.ok !== true) {
      return fail(dealResult && dealResult.code || 'CATALOG_DEALS_INVALID', 'The V3 deal catalog could not be prepared for POS.');
    }
    const deals = [];
    for (const collection of dealResult.collections || []) {
      for (const deal of collection.deals || []) {
        const pricedVariants = (deal.variants || []).filter(row =>
          Number.isSafeInteger(row.basePriceMinor) && row.basePriceMinor >= 0);
        const displayVariants = pricedVariants.length ? pricedVariants : (deal.variants || []);
        deals.push({
          DealID: String(deal.id),
          DealCollectionID: String(collection.id),
          CategoryID: String(collection.categoryId || ''),
          Title: String(deal.title || ''),
          TitleUr: String(deal.titleUr || ''),
          Description: String(deal.description || ''),
          DescriptionUr: String(deal.descriptionUr || ''),
          ImagePath: deal.imagePath || '',
          Available: deal.available === true,
          available: deal.available === true,
          SortOrder: Number(deal.model && deal.model.sortOrder) || 0,
          BranchAvailable: deal.branchAvailable === true,
          ScheduleAvailable: deal.scheduleAvailable === true,
          ScheduleSource: String(deal.scheduleSource || 'unknown'),
          Active: true,
          BundlePrice: displayVariants.length
            ? Math.min(...displayVariants.map(row => row.basePriceMinor).filter(Number.isSafeInteger)) / 100
            : null,
          SchemaVersion: 3,
          CatalogPublicationId: snapshot.publicationId,
          variants: displayVariants,
          model: deal
        });
      }
    }

    const deliveryAreas = snapshot.deliveryAreas.map(row => {
      const fee = row.deliveryFee === null || row.deliveryFee === undefined ? null : Number(row.deliveryFee);
      return {
        ID: String(row.deliveryAreaId),
        AreaName: String(row.nameEn || ''),
        AreaNameUr: String(row.nameUr || ''),
        Name: String(row.nameEn || ''),
        Fee: Number.isFinite(fee) && fee >= 0 ? fee : null,
        DeliveryFee: Number.isFinite(fee) && fee >= 0 ? fee : null,
        Active: row.isAvailable === true
      };
    }).filter(row => row.Active);

    return {
      ok: true,
      schemaVersion: 3,
      publicationId: snapshot.publicationId,
      versionId: snapshot.versionId,
      publicationNumber: snapshot.publicationNumber,
      databaseNow,
      branchId: branch.branchId,
      branchName: branch.name || '',
      currencyCode: snapshot.settings.currency_code,
      categories,
      subcategories,
      menu,
      deliveryAreas,
      deals,
      variantById: Object.fromEntries(variantById)
    };
  }

  function productModifierGroups(snapshot, productId, variantId, contract, dealView) {
    if (!snapshot || snapshot.schemaVersion !== 3 ||
        !contract || !dealView || typeof dealView.buildProductModifierGroups !== 'function') {
      return fail('CATALOG_RUNTIME_UNAVAILABLE', 'The V3 modifier catalog is unavailable.');
    }
    const groups = dealView.buildProductModifierGroups(snapshot, productId, variantId, contract);
    return groups.map(group => ({
      ModifierGroupID: String(group.id),
      NameEn: String(group.name || ''),
      NameUr: String(group.nameUr || ''),
      MinSelect: Number(group.minSelect) || 0,
      MaxSelect: Number(group.maxSelect) || 1,
      options: (group.modifiers || []).map(modifier => ({
        ModifierID: String(modifier.id),
        NameEn: String(modifier.name || ''),
        NameUr: String(modifier.nameUr || ''),
        PriceMode: 'RESOLVED',
        FixedPrice: modifier.priceMinor / 100,
        Price: modifier.priceMinor / 100,
        PriceMinor: modifier.priceMinor
      }))
    }));
  }

  return { adapt, productModifierGroups };
});
