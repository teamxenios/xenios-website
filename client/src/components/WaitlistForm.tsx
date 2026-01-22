import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2 } from "lucide-react";
import { waitlistService } from "@/lib/waitlist-service";
import { motion, AnimatePresence } from "framer-motion";

const formSchema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  lastName: z.string().min(2, "Last name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  role: z.string({ required_error: "Please select a role" }),
  missingTechFeedback: z.string().max(500, "Maximum 500 characters").optional(),
});

export default function WaitlistForm() {
  const { toast } = useToast();
  const [isSuccess, setIsSuccess] = useState(false);
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      missingTechFeedback: "",
    },
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      const response = await waitlistService.submit({
        ...values,
        sourcePage: window.location.pathname,
        submissionType: "general"
      });
      setIsSuccess(true);
      toast({
        title: "Welcome aboard",
        description: response.message,
      });
      form.reset();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Something went wrong",
        description: error instanceof Error ? error.message : "Please try again later.",
      });
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <AnimatePresence mode="wait">
        {isSuccess ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex flex-col items-center justify-center p-8 text-center bg-secondary/30 border border-border rounded-lg"
          >
            <div className="w-12 h-12 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-display font-medium mb-2">You're on the list!</h3>
            <p className="text-muted-foreground mb-6">
              We'll notify you as soon as spots open up.
            </p>
            <Button 
              variant="outline" 
              onClick={() => setIsSuccess(false)}
              className="border-border hover:bg-background"
            >
              Add another email
            </Button>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 text-left">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input 
                            placeholder="First name" 
                            {...field} 
                            disabled={isSubmitting}
                            className="rounded-none border-border bg-background focus-visible:ring-0 focus-visible:border-primary h-12"
                          />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input 
                            placeholder="Last name" 
                            {...field} 
                            disabled={isSubmitting}
                            className="rounded-none border-border bg-background focus-visible:ring-0 focus-visible:border-primary h-12"
                          />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input 
                          placeholder="Email address" 
                          type="email"
                          {...field} 
                          disabled={isSubmitting}
                          className="rounded-none border-border bg-background focus-visible:ring-0 focus-visible:border-primary h-12"
                        />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="rounded-none border-border bg-background focus:ring-0 focus:border-primary h-12">
                            <SelectValue placeholder="Select your role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Trainer">Personal Trainer</SelectItem>
                          <SelectItem value="Health Coach">Health Coach</SelectItem>
                          <SelectItem value="Strength Coach">Strength Coach</SelectItem>
                          <SelectItem value="Team Coach">Team Coach</SelectItem>
                          <SelectItem value="Gym Owner">Gym Owner</SelectItem>
                          <SelectItem value="Performance Staff">Performance Staff</SelectItem>
                          <SelectItem value="Athlete">Athlete</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="missingTechFeedback"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea 
                          placeholder="Example: easier programming, better check-ins, faster documentation, better client insights, fewer apps, team collaboration…"
                          {...field} 
                          disabled={isSubmitting}
                          maxLength={500}
                          className="rounded-none border-border bg-background focus-visible:ring-0 focus-visible:border-primary min-h-[100px] resize-none"
                        />
                      </FormControl>
                      <FormDescription className="text-xs text-muted-foreground/70">
                        Optional. 1–2 sentences is perfect.
                      </FormDescription>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
                
                <Button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="w-full h-12 rounded-none font-medium text-base transition-all"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Joining...
                    </>
                  ) : (
                    "Join Waitlist"
                  )}
                </Button>
                
                <div className="flex flex-col gap-1 text-center pt-2">
                  <p className="text-xs text-muted-foreground">
                    Get early access updates. No spam.
                  </p>
                  <p className="text-[10px] text-muted-foreground/60">
                    Your info stays private.
                  </p>
                </div>
              </form>
            </Form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
