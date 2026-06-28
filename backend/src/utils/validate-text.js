export const isVietnameseText = (text) => {
  if (typeof text !== "string") return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  return /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴĐ]/u.test(trimmed);
};

export const isProbablyEnglishText = (text) => {
  if (typeof text !== "string") return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.length > 1500) return false;
  return /[a-zA-Z]/.test(trimmed);
};

export const isValidTextForTranslation = (text) => {
  if (typeof text !== "string") return false;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 1) return false;
  if (trimmed.length > 1500) return false;
  return /[a-zA-ZàáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴĐ]/u.test(trimmed);
};

export const autoDetectDirection = (text) => {
  return isVietnameseText(text) ? "vi-en" : "en-vi";
};
