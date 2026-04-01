import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";

export const Accordion = AccordionPrimitive.Root;

export function AccordionItem({
  className = "",
  ...props
}: ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>) {
  return <AccordionPrimitive.Item className={`accordion-item ${className}`} {...props} />;
}

export function AccordionTrigger({
  className = "",
  children,
  ...props
}: ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="accordion-header">
      <AccordionPrimitive.Trigger className={`accordion-trigger ${className}`} {...props}>
        {children}
        <ChevronDown className="accordion-chevron" size={16} aria-hidden="true" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

export function AccordionContent({
  className = "",
  ...props
}: ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>) {
  return <AccordionPrimitive.Content className={`accordion-content ${className}`} {...props} />;
}
