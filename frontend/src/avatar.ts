/**
 * Original avatar is an optional static resource, not part of the blank UI.
 * Place the unmodified image at frontend/assets/avatar.png.
 * Nothing is rendered until the interface is explicitly enabled.
 */
export const AVATAR_RESOURCE = "/assets/avatar.png";

export function preloadAvatar(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Файл аватара не найден: " + AVATAR_RESOURCE));
    image.src = AVATAR_RESOURCE;
  });
}
