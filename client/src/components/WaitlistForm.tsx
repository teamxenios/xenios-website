import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { waitlistService } from "@/lib/waitlist-service";
import { motion, AnimatePresence } from "framer-motion";
import { content } from "@/lib/content";
import { Link } from "wouter";

const formSchema = z.object({
  email: z.string().email("That email doesn't look right — mind double-checking?"),
  role: z.string({ required_error: "Pick whichever's closest. \"Other\" is fine." }).min(1, "Pick whichever's closest. \"Other\" is fine."),
  activeClients: z.string().optional(),
  missingTechFeedback: z.string().max(1000).optional()
});

type FormValues = z.infer<typeof formSchema>;

interface WaitlistFormProps {
  variant?: "inline" | "page";
}

export default function WaitlistForm({ variant = "inline" }: WaitlistFormProps) {
  const { toast } = useToast();
  const [isSuccess, setIsSuccess] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", role: "", activeClients: "", missingTechFeedback: "" }
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(values: FormValues) {
    try {
      await waitlistService.submit({
        email: values.email,
        role: values.role,
        activeClients: values.activeClients || undefined,
        missingTechFeedback: values.missingTechFeedback || undefined,
        sourcePage: window.location.pathname,
        submissionType: "general"
      });
      setIsSuccess(true);
      form.reset();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Something went sideways on our end.",
        description: error instanceof Error ? error.message : "Try once more, or email hello@xeniostechnology.com."
      });
    }
  }

  return (
    <div className="w-full" data-testid="waitlist-form-wrap">
      <AnimatePresence mode="wait">
        {isSuccess ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-paper-elevated border border-hairline rounded-2xl p-8 text-left"
            data-testid="waitlist-success"
          >
            <h3 className="font-display text-3xl text-ink mb-4" data-testid="text-waitlist-success-title">
              {content.waitlistPage.successTitle}
            </h3>
            <p className="text-mono-500 mb-6 leading-relaxed">{content.waitlistPage.successBody}</p>
            <Link
              href="/manifesto"
              className="inline-flex items-center gap-2 text-orange font-semibold hover:underline underline-offset-4"
              data-testid="link-success-manifesto"
            >
              {content.waitlistPage.successCta} →
            </Link>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 text-left">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-mono-500 text-sm font-semibold">Email *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={content.waitlistForm.placeholders.email}
                          type="email"
                          {...field}
                          disabled={isSubmitting}
                          className="h-12 bg-paper-elevated border-hairline rounded-lg text-base focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-0 focus-visible:border-orange"
                          data-testid="input-waitlist-email"
                        />
                      </FormControl>
                      <FormMessage className="text-xs text-[hsl(var(--danger))]" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-mono-500 text-sm font-semibold">I am a… *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger
                            className="h-12 bg-paper-elevated border-hairline rounded-lg text-base"
                            data-testid="select-waitlist-role"
                          >
                            <SelectValue placeholder={content.waitlistForm.placeholders.role} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {content.waitlistForm.roleOptions.map((opt) => (
                            <SelectItem key={opt} value={opt} data-testid={`option-role-${opt.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage className="text-xs text-[hsl(var(--danger))]" />
                    </FormItem>
                  )}
                />

                {variant === "page" && (
                  <FormField
                    control={form.control}
                    name="activeClients"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-mono-500 text-sm font-semibold">
                          If you're a coach, how many active clients do you currently serve? (optional)
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger
                              className="h-12 bg-paper-elevated border-hairline rounded-lg text-base"
                              data-testid="select-waitlist-clients"
                            >
                              <SelectValue placeholder={content.waitlistForm.placeholders.clients} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {content.waitlistForm.activeClientsOptions.map((opt) => (
                              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="missingTechFeedback"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-mono-500 text-sm font-semibold">
                        Anything we should know? (optional)
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={content.waitlistForm.placeholders.notes}
                          {...field}
                          disabled={isSubmitting}
                          maxLength={1000}
                          className="bg-paper-elevated border-hairline rounded-lg min-h-[110px] resize-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-0"
                          data-testid="textarea-waitlist-notes"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full sm:w-auto h-12 px-8 bg-orange text-ink hover:bg-[hsl(var(--orange-hover))] rounded-lg font-semibold text-base"
                  data-testid="button-waitlist-submit"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                    </>
                  ) : (
                    <>{content.waitlistForm.submit} →</>
                  )}
                </Button>

                <p className="text-xs text-mono-300 leading-relaxed pt-2">
                  {content.waitlistForm.microcopy}{" "}
                  <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
                    Read our privacy policy.
                  </Link>
                </p>
              </form>
            </Form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
