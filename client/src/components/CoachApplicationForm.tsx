import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2 } from "lucide-react";
import { waitlistService } from "@/lib/waitlist-service";
import { motion, AnimatePresence } from "framer-motion";

const formSchema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  lastName: z.string().min(2, "Last name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  role: z.string({ required_error: "Please select a role" }),
  activeClients: z.string().min(1, "Please specify active clients"),
  adminHours: z.string().min(1, "Please specify admin hours"),
  dataSources: z.string().min(2, "Please list data sources"),
  anonymizedDataConsent: z.boolean().refine((val) => val === true, {
    message: "You must agree to share anonymized workflow samples",
  }),
});

export default function CoachApplicationForm() {
  const { toast } = useToast();
  const [isSuccess, setIsSuccess] = useState(false);
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      role: "",
      activeClients: "",
      adminHours: "",
      dataSources: "",
      anonymizedDataConsent: false,
    },
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      const response = await waitlistService.submit({
        ...values,
        sourcePage: window.location.pathname,
        submissionType: "coach_partner"
      });
      setIsSuccess(true);
      toast({
        title: "Application Received",
        description: "We'll review your profile and reach out shortly.",
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
    <div className="w-full max-w-xl mx-auto bg-background p-8 border border-border rounded-xl shadow-sm">
      <AnimatePresence mode="wait">
        {isSuccess ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex flex-col items-center justify-center text-center py-12"
          >
            <div className="w-16 h-16 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-display font-medium mb-4">Application Sent</h3>
            <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
              Thank you for applying to be a Founding Coach Partner. We review applications weekly.
            </p>
            <Button 
              variant="outline" 
              onClick={() => setIsSuccess(false)}
              className="border-border hover:bg-secondary/50"
            >
              Submit another application
            </Button>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="mb-8 text-center">
              <h3 className="text-2xl font-display font-medium mb-2">Partner Application</h3>
              <p className="text-sm text-muted-foreground">Join the cohort shaping the future of Xenios.</p>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 text-left">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input placeholder="First name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Last name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="you@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Role</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Trainer">Personal Trainer</SelectItem>
                            <SelectItem value="Health Coach">Health Coach</SelectItem>
                            <SelectItem value="Strength Coach">Strength Coach</SelectItem>
                            <SelectItem value="Team Coach">Team Coach</SelectItem>
                            <SelectItem value="Performance Staff">Performance Staff</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="activeClients"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Active Clients</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Client count" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="1-10">1-10</SelectItem>
                            <SelectItem value="11-30">11-30</SelectItem>
                            <SelectItem value="31-50">31-50</SelectItem>
                            <SelectItem value="50+">50+</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="adminHours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Weekly Admin Hours</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Hours spent on admin" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1-5">1-5 hours</SelectItem>
                          <SelectItem value="6-10">6-10 hours</SelectItem>
                          <SelectItem value="11-20">11-20 hours</SelectItem>
                          <SelectItem value="20+">20+ hours</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dataSources"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Data Sources</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Oura, Whoop, Excel, MyFitnessPal..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="anonymizedDataConsent"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 bg-secondary/10">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>
                          Share anonymized workflow samples
                        </FormLabel>
                        <p className="text-xs text-muted-foreground text-balance">
                          I agree to share anonymized data patterns to help build the platform. No private identifying client details will be shared.
                        </p>
                      </div>
                    </FormItem>
                  )}
                />
                
                <Button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="w-full h-12 rounded-full font-medium text-base transition-all"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    "Apply to be a Partner"
                  )}
                </Button>
                
                <p className="text-xs text-center text-muted-foreground">
                  Your info stays private.
                </p>
              </form>
            </Form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
