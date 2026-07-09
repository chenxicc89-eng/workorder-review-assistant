import * as React from "react";
import { Copy, Check } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/utils/clipboard";
import { useToast } from "@/components/ui/toast";

interface CopyButtonProps extends Omit<ButtonProps, "onClick"> {
  text: string;
  label?: string;
  toastMessage?: string;
}

export function CopyButton({
  text,
  label = "复制",
  toastMessage = "已复制到剪贴板",
  variant = "default",
  size = "sm",
  ...props
}: CopyButtonProps) {
  const { toast } = useToast();
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      toast(toastMessage, "success");
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast("复制失败,请手动选择文本", "error");
    }
  };

  return (
    <Button variant={variant} size={size} onClick={handleCopy} {...props}>
      {copied ? <Check /> : <Copy />}
      {label}
    </Button>
  );
}
