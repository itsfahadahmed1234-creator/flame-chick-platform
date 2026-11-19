/* HFP Phase 2D — central localization dictionary + language switcher.
   Default language is English (never changes Phase 2C behaviour).
   Urdu strings are DRAFT — OWNER REVIEW REQUIRED. Automated tests do NOT
   prove translation accuracy.
   Catalog NameUr/DescriptionUr/TitleUr fields are honored when non-empty;
   empty Urdu catalog fields keep the safe English fallback (never invented). */
var HFP_I18N = (function () {
  'use strict';

  var LANG_KEY = 'pizza_bite_lang';
  var current = 'en';

  /* ===== English source dictionary (keys are stable identifiers) ===== */
  var EN = {
    /* Hours */
    'hours.both': 'Delivery & restaurant hours',
    'hours.deliveryUntil': 'Delivery until',
    'hours.delivery': 'Delivery hours',
    'hours.restaurant': 'Restaurant hours',
    /* Landing */
    'brand.name': 'PIZZA BITE',
    'brand.short': 'Pizza Bite',
    'landing.header.menu': 'MENU',
    'landing.hero.support': 'Freshly prepared pizzas, burgers and more — made hot and fresh in Waisa.',
    'landing.hero.cta': 'MENU',
    'landing.hero.accent': 'PIZZA',
    'landing.hero.main': 'BITE',
    'landing.hero.imageAlt': 'Pizza Bite fresh food and deals',
    'landing.gate.subtitle': 'What are you having today?',
    'landing.about.heading': 'About Pizza Bite',
    'landing.about.desc': 'A local favourite in Waisa — serving fresh pizzas, juicy burgers and loaded favourites made to order.',
    'landing.about.extAlt': 'Pizza Bite deal selection',
    'landing.about.intAlt': 'Pizza Bite meal deal',
    'landing.why.heading': 'The Pizza Bite Difference',
    'landing.why.madeFresh': 'Made Fresh',
    'landing.why.clearPrices': 'Clear Prices',
    'landing.why.quickService': 'Quick Service',
    'landing.why.fastDelivery': 'Fast Delivery',
    'landing.how.heading': 'How to Order',
    'landing.how.choose': 'Choose',
    'landing.how.add': 'Add',
    'landing.how.order': 'Order',
    'landing.how.enjoy': 'Enjoy',
    'landing.menu.heading': 'Explore Our Menu',
    'landing.menu.pizza': 'Pizza',
    'landing.menu.burgers': 'Burgers',
    'landing.menu.shawarma': 'Shawarma',
    'landing.menu.sides': 'Sides & Drinks',
    'landing.menu.friedItems': 'Fried Items',
    'landing.info.heading': 'Find Us',
    'landing.info.callUs': 'Call Us',
    'landing.info.whatsapp': 'WhatsApp',
    'landing.info.messageUs': 'Message Us',
    'landing.info.cashOnDelivery': 'Cash on Delivery',
    'landing.info.payAtDoor': 'Pay at door',
    'landing.info.hotFresh': 'Hot & Fresh',
    'landing.info.madeToOrder': 'Made to order',
    'landing.info.location': 'Location',
    'landing.info.hours': 'Opening Hours',
    'landing.cta.heading': 'Ready for something good?',
    'landing.cta.button': 'ORDER NOW',
    /* Footer contact number renders from js/config.js PHONE_DISPLAY via
       landingDefaults().footer.contact — dictionary keeps the brand only. */
    'landing.footer.contact': 'Pizza Bite',
    /* Fulfillment */
    'fulfillment.Delivery': 'Delivery',
    'fulfillment.Takeaway': 'Takeaway',
    /* Topbar / cart chrome */
    'nav.cart': 'Cart',
    'nav.yourCart': 'Your Cart',
    'nav.clearAll': 'Clear all',
    'cart.empty': 'Your cart is empty.',
    'cart.emptySub': 'Add something delicious!',
    'cart.edit': 'Edit',
    'cart.remove': 'Remove',
    'cart.comboDeal': 'Combo Deal',
    'cart.dealPrice': 'Deal Price:',
    'cart.special': 'Special:',
    'cart.items': 'items',
    'cart.item': 'item',
    'cart.viewCart': 'View Cart',
    /* Menu hero */
    'menu.hero.eyebrow': 'Pizza Bite',
    'menu.hero.title1': 'Your Next',
    'menu.hero.title2': 'Favourite Meal',
    'menu.hero.desc': 'Fresh pizzas, juicy burgers, loaded shawarmas and more — made hot and fresh when you order.',
    'menu.hero.orderNow': 'ORDER NOW',
    'menu.hero.hotFresh': 'HOT & FRESH',
    'menu.hero.fromKitchen': 'Straight from the kitchen',
    /* Category / cards */
    'menu.popular': 'Popular',
    'menu.seeAll': 'See All',
    'menu.browse': 'Browse',
    'menu.popularTag': '★ Popular',
    'menu.selectSize': 'Select Size',
    'menu.add': '+ Add',
    'menu.unavailable': 'Unavailable',
    'menu.chooseSize': 'Choose your size',
    'menu.noMatch': 'No matching items found.',
    'menu.loading': 'Loading menu…',
    /* Product / pizza modal */
    'modal.productDetails': 'Product Details',
    'modal.choosePizzaSize': 'Choose your pizza size',
    'modal.deal': 'Deal',
    'modal.checkout': 'Checkout',
    'modal.qty': 'Quantity',
    'modal.share': 'Share',
    'modal.whatsapp': 'WhatsApp',
    'modal.specialInstructions': 'Special Instructions',
    'modal.specialPhLong': 'Any special request? e.g. less spicy, no mayo, cut differently…',
    'modal.specialPh': 'Any special request?',
    /* Currency is appended by cur() at call sites — keys must NOT embed it
       (embedding here caused "Rs. Rs." duplicates on button labels). */
    'btn.addToCart': 'Add to Cart — ',
    'btn.updateCart': 'Update Cart — ',
    'btn.addToCartDot': 'Add to Cart · ',
    'btn.updateCartDot': 'Update Cart · ',
    /* Deals */
    'deal.tag': 'DEAL',
    'deal.view': 'View Deal',
    'deal.choose': 'Choose…',
    'deal.included': '(included)',
    'deal.noOptions': 'No {size} options are available right now.',
    'deal.chooseAll': 'Choose all {n} remaining selection{s} to add this deal.',
    'deal.includes': 'Your deal includes',
    'deal.unavailableToast': 'Deal unavailable',
    'deal.completeToast': 'Complete your deal',
    'deal.chooseSlot': 'Choose an option for every slot before adding this deal.',
    /* Modifiers */
    'mod.reqHint': '(choose 1 — required)',
    'mod.oneHint': '(optional, one only)',
    'mod.optHint': '(optional)',
    'mod.naSize': 'Not available for this size',
    'mod.plusRs': '+ ',
    'mod.choose': 'Choose your {name}',
    'mod.selectOne': 'Please select one {name} to continue.',
    /* Toasts */
    'toast.added': 'Added to cart',
    'toast.addedSub': 'Your item is ready in the cart.',
    'toast.cannotAdd': 'Cannot add item',
    'toast.cartUpdated': 'Cart updated',
    'toast.cartRefreshed': 'Cart refreshed',
    'toast.cartRefreshedSub': 'Prices and availability were updated from the latest menu.',
    'toast.cartAttention': 'Cart needs attention',
    'toast.copied': 'Copied',
    'toast.copiedSub': 'The full order message is on your clipboard.',
    'toast.copyManually': 'Copy manually',
    'toast.copyManuallySub': 'Press Ctrl+C to copy the selected message.',
    /* Checkout form */
    'checkout.fullName': 'Full Name',
    'checkout.yourName': 'Your name',
    'checkout.phone': 'Phone Number',
    'checkout.address': 'Delivery Address',
    'checkout.addressPh': 'House, street, landmark…',
    'checkout.area': 'Delivery Area *',
    'checkout.areaSearch': 'Search your area...',
    'checkout.payment': 'Payment Method',
    'checkout.cod': 'Cash on Delivery',
    'checkout.notes': 'Order Notes',
    'checkout.notesPh': 'Optional instructions',
    'checkout.sendWA': 'Place Order',
    'checkout.secure': '🔒 Your order is submitted securely to Pizza Bite · Cash on Delivery',
    'checkout.proceed': 'Proceed to Checkout →',
    'checkout.secureShort': '🔒 Secure checkout · Cash on Delivery',
    'checkout.resolveIssues': 'Please resolve these before sending your order:',
    'checkout.resolveToSend': 'Resolve cart issues to send',
    'checkout.fulfillment': 'Fulfillment',
    'checkout.subtotal': 'Subtotal',
    'checkout.discount': 'Discount',
    'checkout.delivery': 'Delivery',
    'checkout.total': 'Total',
    'checkout.free': 'Free',
    'checkout.titleType': 'Checkout · {type}',
    /* Area picker */
    'area.noMatch': 'No match found — pick "Other / Not Listed" below.',
    'area.other': 'Other / Not Listed',
    'area.standardFee': 'We will use the standard delivery fee',
    'area.feeLabel': 'Delivery fee ',
    'area.gone': 'Delivery area no longer available',
    'area.goneSub': 'That area was removed from our list — please pick another one.',
    /* Unavailable panel */
    'na.heading': 'The menu is unavailable right now',
    'na.desc': 'Our online menu cannot be loaded at the moment. You can still reach us to ask about today’s food and prices.',
    'na.waInquiry': 'WhatsApp inquiry',
    'na.call': 'Call {phone}',
    'na.retry': 'Try again',
    /* Success + WA fallback */
    'success.title': 'Order Received!',
    'success.body': 'Thank you. Pizza Bite has received your order and will contact you if any details need confirmation.',
    'success.help': 'Need help? Call us: ',
    'success.done': 'Done',
    'waFallback.title': 'Send your order on WhatsApp',
    'waFallback.note': 'Your order is complete, but it is too long for a single WhatsApp link — nothing was cut. Copy the full message below, then paste it into the chat we open for you.',
    'waFallback.copy': 'Copy full message',
    'waFallback.open': 'Open WhatsApp chat',
    /* Language switcher */
    'lang.label': 'Language',
    'lang.en': 'English',
    /* Currency token used in UI concatenations (digits stay Western) */
    'currency.rs': 'Rs. ',
    /* Engine issue codes localized at display time (engine itself stays English for tests) */
    'issue.DEAL_MISSING': 'This deal is no longer on the menu.',
    'issue.DEAL_INACTIVE': 'This deal is no longer offered.',
    'issue.DEAL_UNAVAILABLE': '"{title}" is temporarily unavailable.',
    'issue.VARIANT_MISSING': '"{name}" is no longer on the menu.',
    'issue.VARIANT_INACTIVE': '"{name}" is no longer offered.',
    'issue.VARIANT_UNAVAILABLE': '"{name}" is currently unavailable.',
    'issue.PRODUCT_MISSING': '"{name}" is no longer on the menu.',
    'issue.PRODUCT_INACTIVE': '"{name}" is no longer offered.',
    'issue.PRODUCT_UNAVAILABLE': '"{name}" is currently unavailable.',
    'issue.MODIFIER_NOT_ELIGIBLE': '"{name}" can no longer be added to this item.',
    'issue.MODIFIER_PRICE_MISSING': '"{name}" cannot be priced for this size.',
    'issue.QTY_INVALID': 'Quantity must be at least 1.',
    'issue.DEAL_INCOMPLETE': 'Your "{title}" still needs {n} selection{s}.',
    'issue.LINE_INVALID': 'Invalid cart line.',
    'issue.CART_STALE': 'Cart was updated from the latest menu.'
  };

  /* ===== Urdu DRAFT — OWNER REVIEW REQUIRED ===== */
  var UR = {
    /* Hours */
    'hours.both': 'ڈیلیوری اور ریسٹورنٹ کے اوقات',
    'hours.deliveryUntil': 'ڈیلیوری تک',
    'hours.delivery': 'ڈیلیوری کے اوقات',
    'hours.restaurant': 'ریسٹورنٹ کے اوقات',
    'brand.name': 'پیزا بائٹ',
    'brand.short': 'پیزا بائٹ',
    'landing.header.menu': 'مینو',
    'landing.hero.support': 'گرم پیزا، رس دار برگرز اور بھرپور شوارما — آرڈر پر تیار۔',
    'landing.hero.cta': 'مینو',
    'landing.hero.accent': 'پیزا',
    'landing.hero.main': 'بائٹ',
    'landing.hero.imageAlt': 'پیزا بائٹ کے کھانے اور ڈیلز',
    'landing.gate.subtitle': 'آج آپ کیا لینا پسند کریں گے؟',
    'landing.about.heading': 'پیزا بائٹ کے بارے میں',
    'landing.about.desc': 'ویسا کی پسندیدہ جگہ — تازہ پیزا، رس دار برگرز اور مزیدار کھانے، آپ کے آرڈر پر تیار۔',
    'landing.about.extAlt': 'پیزا بائٹ کی ڈیلز',
    'landing.about.intAlt': 'پیزا بائٹ کی کھانے کی ڈیل',
    'landing.why.heading': 'پیزا بائٹ کی خوبیاں',
    'landing.why.madeFresh': 'تازہ تیار',
    'landing.why.clearPrices': 'کھلے قیمیں',
    'landing.why.quickService': 'فوری خدمات',
    'landing.why.fastDelivery': 'تیز ڈیلیوری',
    'landing.how.heading': 'آرڈر کیسے کریں',
    'landing.how.choose': 'منتخب کریں',
    'landing.how.add': 'شامل کریں',
    'landing.how.order': 'آرڈر دیں',
    'landing.how.enjoy': 'لطف اٹھائیں',
    'landing.menu.heading': 'ہمارا مینو دیکھیں',
    'landing.menu.pizza': 'پیزا',
    'landing.menu.burgers': 'برگرز',
    'landing.menu.shawarma': 'شوارما',
    'landing.menu.sides': 'سائیڈز اور مشروبات',
    'landing.menu.friedItems': 'فرائیڈ آئٹمز',
    'landing.info.heading': 'ہمیں تلاش کریں',
    'landing.info.callUs': 'کال کریں',
    'landing.info.whatsapp': 'واتس ایپ',
    'landing.info.messageUs': 'پیغام بھیجیں',
    'landing.info.cashOnDelivery': 'ڈیلیوری پر نقد ادائیگی',
    'landing.info.payAtDoor': 'دروازے پر ادائیگی',
    'landing.info.hotFresh': 'گرم اور تازہ',
    'landing.info.madeToOrder': 'آرڈر پر تیار',
    'landing.info.location': 'مقام',
    'landing.info.hours': 'اوقاتِ کار',
    'landing.cta.heading': 'کچھ خوشگوار چیز کے لیے تیار ہیں؟',
    'landing.cta.button': 'ابھی آرڈر کریں',
    /* Footer contact number renders from js/config.js PHONE_DISPLAY via
       landingDefaults().footer.contact — dictionary keeps the brand only. */
    'landing.footer.contact': 'Pizza Bite',
    'fulfillment.Delivery': 'ڈیلیوری',
    'fulfillment.Takeaway': 'ٹیک اوے',
    'nav.cart': 'کارٹ',
    'nav.yourCart': 'آپ کی کارٹ',
    'nav.clearAll': 'سب صاف کریں',
    'cart.empty': 'آپ کی کارٹ خالی ہے۔',
    'cart.emptySub': 'کچھ مزیدار شامل کریں!',
    'cart.edit': 'تبدیلی',
    'cart.remove': 'ہٹائیں',
    'cart.comboDeal': 'کومبو ڈیل',
    'cart.dealPrice': 'ڈیل قیمت:',
    'cart.special': 'خصوصی:',
    'cart.items': 'اشیاء',
    'cart.item': 'چیز',
    'cart.viewCart': 'کارٹ دیکھیں',
    'menu.hero.eyebrow': 'پیزا بائٹ',
    'menu.hero.title1': 'آپ کی اگلی',
    'menu.hero.title2': 'پسندیدہ کھانا',
    'menu.hero.desc': 'تازہ پیزا، رس دار برگرز، بھرپور شوارما اور بہت کچھ — آرڈر پر گرم اور تیار۔',
    'menu.hero.orderNow': 'ابھی آرڈر کریں',
    'menu.hero.hotFresh': 'گرم اور تازہ',
    'menu.hero.fromKitchen': 'سیدھا باورچی خانے سے',
    'menu.popular': 'مقبول',
    'menu.seeAll': 'سب دیکھیں',
    'menu.browse': 'دیکھیں',
    'menu.popularTag': '★ مقبول',
    'menu.selectSize': 'سائز منتخب کریں',
    'menu.add': '+ شامل کریں',
    'menu.unavailable': 'دستیاب نہیں',
    'menu.chooseSize': 'اپنا سائز منتخب کریں',
    'menu.noMatch': 'کوئی مطابقت والا آئٹم نہیں ملا۔',
    'menu.loading': 'مینو لوڈ ہو رہا ہے…',
    'modal.productDetails': 'پروڈکٹ تفصیل',
    'modal.choosePizzaSize': 'اپنا پیزا سائز منتخب کریں',
    'modal.deal': 'ڈیل',
    'modal.checkout': 'چیک آؤٹ',
    'modal.qty': 'تعداد',
    'modal.share': 'شیئر کریں',
    'modal.whatsapp': 'واتس ایپ',
    'modal.specialInstructions': 'خصوصی ہدایات',
    'modal.specialPhLong': 'کوئی خاص درخواست؟ مثلاً کم تیز، مایو نہیں، الگ طرح کاٹنا…',
    'modal.specialPh': 'کوئی خاص درخواست؟',
    'btn.addToCart': 'کارٹ میں شامل کریں — ',
    'btn.updateCart': 'کارٹ تبدیل کریں — ',
    'btn.addToCartDot': 'کارٹ میں شامل کریں · ',
    'btn.updateCartDot': 'کارٹ تبدیل کریں · ',
    'deal.tag': 'ڈیل',
    'deal.view': 'ڈیل دیکھیں',
    'deal.choose': 'منتخب کریں…',
    'deal.included': '(شامل)',
    'deal.noOptions': 'فی الحال کوئی {size} آپشن دستیاب نہیں۔',
    'deal.chooseAll': 'یہ ڈیل شامل کرنے کے لیے باقی {n} انتخابات مکمل کریں۔',
    'deal.includes': 'آپ کی ڈیل میں شامل ہے',
    'deal.unavailableToast': 'یہ ڈیل دستیاب نہیں',
    'deal.completeToast': 'اپنی ڈیل مکمل کریں',
    'deal.chooseSlot': 'یہ ڈیل شامل کرنے سے پہلے ہر سلاٹ کے لیے آپشن منتخب کریں۔',
    'mod.reqHint': '(ایک منتخب کریں — لازمی)',
    'mod.oneHint': '(اختیاری، صرف ایک)',
    'mod.optHint': '(اختیاری)',
    'mod.naSize': 'اس سائز کے لیے دستیاب نہیں',
    'mod.plusRs': '+ ',
    'mod.choose': 'اپنا {name} منتخب کریں',
    'mod.selectOne': 'جاری رکھنے کے لیے ایک {name} منتخب کریں۔',
    'toast.added': 'کارٹ میں شامل ہو گیا',
    'toast.addedSub': 'آپ کی چیز کارٹ میں تیار ہے۔',
    'toast.cannotAdd': 'چیز شامل نہیں ہو سکتی',
    'toast.cartUpdated': 'کارٹ اپڈیٹ ہو گئی',
    'toast.cartRefreshed': 'کارٹ ریفریش ہو گئی',
    'toast.cartRefreshedSub': 'قیمیں اور دستیابی تازہ مینو سے اپڈیٹ ہو گئی ہیں۔',
    'toast.cartAttention': 'کارٹ کو توجہ درکار ہے',
    'toast.copied': 'کاپی ہو گیا',
    'toast.copiedSub': 'مکمل آرڈر پیغام آپ کے کلپ بورڈ پر ہے۔',
    'toast.copyManually': 'خود کاپی کریں',
    'toast.copyManuallySub': 'منتخب پیغام کاپی کرنے کے لیے Ctrl+C دبائیں۔',
    'checkout.fullName': 'پورا نام',
    'checkout.yourName': 'آپ کا نام',
    'checkout.phone': 'فون نمبر',
    'checkout.address': 'ڈیلیوری ایڈریس',
    'checkout.addressPh': 'گھر، گلی، نشانی…',
    'checkout.area': 'ڈیلیوری علاقہ *',
    'checkout.areaSearch': 'اپنا علاقہ تلاش کریں…',
    'checkout.payment': 'ادائیگی کا طریقہ',
    'checkout.cod': 'ڈیلیوری پر نقد',
    'checkout.notes': 'آرڈر نوٹس',
    'checkout.notesPh': 'اختیاری ہدایات',
    'checkout.sendWA': 'آرڈر جمع کروائیں',
    'checkout.secure': '🔒 آپ کا آرڈر محفوظ طریقے سے پیزا بائٹ کو موصول ہوگا · نقد ادائیگی',
    'checkout.proceed': 'چیک آؤٹ کریں →',
    'checkout.secureShort': '🔒 محفوظ چیک آؤٹ · نقد ادائیگی',
    'checkout.resolveIssues': 'آرڈر بھیجنے سے پہلے ان مسائل کو حل کریں:',
    'checkout.resolveToSend': 'بھیجنے کے لیے کارٹ کے مسائل حل کریں',
    'checkout.fulfillment': 'تکمیل کا طریقہ',
    'checkout.subtotal': 'ذیلی میزان',
    'checkout.discount': 'رعایت',
    'checkout.delivery': 'ڈیلیوری',
    'checkout.total': 'کل رقم',
    'checkout.free': 'مفت',
    'checkout.titleType': 'چیک آؤٹ · {type}',
    'area.noMatch': 'کوئی نتیجہ نہیں ملا — نیچے "دیگر / فہرست میں نہیں" منتخب کریں۔',
    'area.other': 'دیگر / فہرست میں نہیں',
    'area.standardFee': 'ہم معیاری ڈیلیوری فی استعمال کریں گے',
    'area.feeLabel': 'ڈیلیوری فی ',
    'area.gone': 'ڈیلیوری ایریا اب دستیاب نہیں',
    'area.goneSub': 'وہ ایریا فہرست سے ہٹا دیا گیا ہے — براہ کرم کوئی اور منتخب کریں۔',
    'na.heading': 'مینو فی الحال دستیاب نہیں ہے',
    'na.desc': 'ہمارا آن لائن مینو فی الحال لوڈ نہیں ہو سکتا۔ آج کے کھانے اور قیمیں جاننے کے لیے آپ ہم سے رابطہ کر سکتے ہیں۔',
    'na.waInquiry': 'واتس ایپ انکوائری',
    'na.call': 'کال کریں {phone}',
    'na.retry': 'دوبارہ کوشش کریں',
    'success.title': 'آرڈر موصول ہو گیا!',
    'success.body': 'شکریہ۔ پیزا بائٹ کو آپ کا آرڈر موصول ہو گیا ہے۔ ضرورت پڑنے پر ہم آپ سے رابطہ کریں گے۔',
    'success.help': 'مدد چاہیے؟ کال کریں: ',
    'success.done': 'ہو گیا',
    'waFallback.title': 'واتس ایپ پر اپنا آرڈر بھیجیں',
    'waFallback.note': 'آپ کا آرڈر مکمل ہے، لیکن یہ ایک واتس ایپ لنک کے لیے بہت طویل ہے — کچھ کاٹا نہیں گیا۔ نیچے پورا پیغام کاپی کریں، پھر ہم جو چیٹ کھولتے ہیں اس میں پیسٹ کریں۔',
    'waFallback.copy': 'پورا پیغام کاپی کریں',
    'waFallback.open': 'واتس ایپ چیٹ کھولیں',
    'lang.label': 'زبان',
    'lang.en': 'English',
    'currency.rs': 'روپے ',
    'issue.DEAL_MISSING': 'یہ ڈیل اب مینو میں نہیں ہے۔',
    'issue.DEAL_INACTIVE': 'یہ ڈیل اب پیشکش نہیں کی جا رہی۔',
    'issue.DEAL_UNAVAILABLE': '"{title}" عارضی طور پر دستیاب نہیں۔',
    'issue.VARIANT_MISSING': '"{name}" اب مینو میں نہیں ہے۔',
    'issue.VARIANT_INACTIVE': '"{name}" اب پیشکش نہیں کی جا رہی۔',
    'issue.VARIANT_UNAVAILABLE': '"{name}" فی الحال دستیاب نہیں۔',
    'issue.PRODUCT_MISSING': '"{name}" اب مینو میں نہیں ہے۔',
    'issue.PRODUCT_INACTIVE': '"{name}" اب پیشکش نہیں کی جا رہی۔',
    'issue.PRODUCT_UNAVAILABLE': '"{name}" فی الحال دستیاب نہیں۔',
    'issue.MODIFIER_NOT_ELIGIBLE': '"{name}" اب اس آئٹم میں شامل نہیں کیا جا سکتا۔',
    'issue.MODIFIER_PRICE_MISSING': '"{name}" کی قیمت اس سائز کے لیے معلوم نہیں ہو سکتی۔',
    'issue.QTY_INVALID': 'تعداد کم از کم 1 ہونی چاہیے۔',
    'issue.DEAL_INCOMPLETE': 'آپ کی "{title}" میں ابھی {n} انتخابات درکار ہیں۔',
    'issue.LINE_INVALID': 'ناجائز کارٹ لائن۔',
    'issue.CART_STALE': 'کارٹ تازہ مینو سے اپڈیٹ ہو گئی۔'
  };

  var DICT = { en: EN, ur: UR };

  /* ===== Published bilingual website content (admin website editor) =====
     settings.website_content -> i18n key overrides. The dictionary stays the
     fallback: a missing section/field or an empty value for the active
     language always falls back to the built-in copy for that language. */
  var CONTENT_MAP = {
    landing_hero: {
      title_accent: 'landing.hero.accent',
      title_main: 'landing.hero.main',
      support: 'landing.hero.support',
      cta: 'landing.hero.cta',
      gate_subtitle: 'landing.gate.subtitle'
    },
    menu_hero: {
      eyebrow: 'menu.hero.eyebrow',
      title1: 'menu.hero.title1',
      title2: 'menu.hero.title2',
      desc: 'menu.hero.desc',
      order_now: 'menu.hero.orderNow'
    }
  };
  var contentOverride = {};

  /** Install the published website_content model as per-language overrides.
      Unknown sections/fields are ignored; empty/whitespace values are dropped
      so that language falls back to the dictionary. Pass null/undefined to
      clear every override (e.g. catalog without published content). */
  function applyContent(model) {
    contentOverride = {};
    if (!model || typeof model !== 'object') return;
    Object.keys(CONTENT_MAP).forEach(function (section) {
      var sec = model[section];
      if (!sec || typeof sec !== 'object') return;
      Object.keys(CONTENT_MAP[section]).forEach(function (field) {
        var raw = sec[field];
        if (!raw || typeof raw !== 'object') return;
        var en = typeof raw.en === 'string' ? raw.en.trim() : '';
        var ur = typeof raw.ur === 'string' ? raw.ur.trim() : '';
        if (en || ur) contentOverride[CONTENT_MAP[section][field]] = { en: en, ur: ur };
      });
    });
  }

  /** Override for `key` in the CURRENT language, else null (dictionary path). */
  function currentOverride(key) {
    var o = contentOverride[key];
    if (!o) return null;
    var v = current === 'ur' ? o.ur : o.en;
    return v ? v : null;
  }

  function detect() {
    /* Preview/testing only: ?lang=ur|en overrides stored preference for that
       single load and must NOT be written to localStorage (otherwise a preview
       hijacks the visitor's stored language choice on the next visit). */
    try {
      if (typeof location !== 'undefined' && location.search) {
        var q = new URLSearchParams(location.search).get('lang');
        if (q === 'ur' || q === 'en') return q;
      }
    } catch (e) { /* ignore */ }
    try {
      var saved = localStorage.getItem(LANG_KEY);
      if (saved === 'ur' || saved === 'en') return saved;
    } catch (e) { /* ignore */ }
    return 'en';
  }

  function get() { return current; }

  function set(lang, opts) {
    lang = (lang === 'ur') ? 'ur' : 'en';
    current = lang;
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* ignore */ }
    applyDomLanguage();
    if (!(opts && opts.silent) && typeof window !== 'undefined' && typeof window.onHfpLanguageChange === 'function') {
      window.onHfpLanguageChange(lang);
    }
    return lang;
  }

  function t(key, params) {
    var s = currentOverride(key);
    if (s === null) {
      var table = DICT[current] || EN;
      s = table[key];
      if (s === undefined || s === null || s === '') s = EN[key];
      if (s === undefined || s === null) s = key;
    }
    if (params) {
      s = String(s).replace(/\{(\w+)\}/g, function (m0, name) {
        if (params[name] !== undefined && params[name] !== null) return String(params[name]);
        return m0;
      });
    }
    return s;
  }

  /* Localize a pricing-engine issue for display. Engine stays English (tests);
     UI maps by code when possible, falls back to the English message. */
  function issueText(issue) {
    if (!issue) return '';
    var code = issue.code || '';
    var key = 'issue.' + code;
    var table = DICT[current] || EN;
    var tmpl = table[key];
    if (tmpl === undefined || tmpl === null || tmpl === '') tmpl = EN[key];
    if (tmpl === undefined || tmpl === null) return String(issue.message || '');
    var n = 1;
    if (code === 'DEAL_INCOMPLETE') {
      var mm = /(\d+)\s+selection/.exec(String(issue.message || ''));
      if (mm) n = Number(mm[1]) || 1;
    }
    return t(key, {
      name: issue.name || '',
      title: issue.title || issue.name || '',
      n: n,
      s: n === 1 ? '' : 'z'
    });
  }

  function applyDomLanguage() {
    if (typeof document === 'undefined') return;
    var root = document.documentElement;
    root.setAttribute('lang', current === 'ur' ? 'ur' : 'en');
    root.setAttribute('dir', current === 'ur' ? 'rtl' : 'ltr');
    if (current === 'ur') root.classList.add('lang-ur');
    else root.classList.remove('lang-ur');
  }

  function init() {
    current = detect();
    applyDomLanguage();
  }

  /* Auto-boot as early as possible (script is loaded before app.js). */
  if (typeof document !== 'undefined') init();

  return {
    LANG_KEY: LANG_KEY,
    get: get,
    set: set,
    t: t,
    issueText: issueText,
    isUrdu: function () { return current === 'ur'; },
    init: init,
    dictionaries: DICT,
    applyContent: applyContent,
    content: function () { return contentOverride; },
    CONTENT_MAP: CONTENT_MAP,
    /* Test helper: English keys that must exist in Urdu (and vice versa). */
    keyParity: function () {
      var enKeys = Object.keys(EN).sort();
      var urKeys = Object.keys(UR).sort();
      var missingInUr = enKeys.filter(function (k) { return urKeys.indexOf(k) === -1; });
      var missingInEn = urKeys.filter(function (k) { return enKeys.indexOf(k) === -1; });
      return { missingInUr: missingInUr, missingInEn: missingInEn, enCount: enKeys.length, urCount: urKeys.length };
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = HFP_I18N;